import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decryptMetadata,
  decryptScalar,
  decryptVector,
  encryptMetadataVector,
  encryptScalar,
  encryptVector,
  generateClientAccountBundle,
  validateAndMeasureImportedBundle,
} from '../src/services/ckksService'
import { ApiError, createApiClient } from '../src/services/apiClient'
import { DEFAULT_DISCOUNTS, DEFAULT_PRODUCTS } from '../src/config/catalogDefaults'

describe('Cryptomart Frontend CKKS Client & Backend REST API Decoupling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generates keys locally, encrypts/decrypts scalars & metadata, and enforces user key isolation', async () => {
    const alice = await generateClientAccountBundle('alice', 'standard_8192')
    const bob = await generateClientAccountBundle('bob', 'standard_8192')

    const encBal = await encryptScalar(alice, 78000)
    const decAlice = await decryptScalar(alice, encBal.ciphertextBase64)
    expect(Math.abs(decAlice.rawValue - 78000)).toBeLessThan(0.05)

    // Re-import Alice's saved keys without regenerating
    const restoredAlice = await validateAndMeasureImportedBundle(
      'alice',
      'standard_8192',
      alice.params_b64,
      alice.secret_key_b64,
      alice.public_key_b64,
      alice.relin_key_b64
    )
    const decRestored = await decryptScalar(restoredAlice, encBal.ciphertextBase64)
    expect(Math.abs(decRestored.rawValue - 78000)).toBeLessThan(0.05)

    // Bob's secret key must not recover Alice's value
    const decBob = await decryptScalar(bob, encBal.ciphertextBase64)
    expect(Math.abs(decBob.rawValue - 78000)).toBeGreaterThan(100)

    // Metadata vector [product_numeric_id=1, quantity=2, discount_numeric_id=1]
    const encMeta = await encryptMetadataVector(alice, 1, 2, 1)
    const decMeta = await decryptMetadata(
      alice,
      encMeta.ciphertextBase64,
      DEFAULT_PRODUCTS,
      DEFAULT_DISCOUNTS
    )
    expect(decMeta.productId).toBe('CAKE-STRW')
    expect(decMeta.quantityRounded).toBe(2)
    expect(decMeta.discountCode).toBe('REF10_500')
    expect(decMeta.withinTolerance).toBe(true)
  }, 20000)

  it('sends Activate, CheckBalance, Topup, Transact, GetTransact, and BatchTransact HTTP requests to backend without secret_key', async () => {
    const alice = await generateClientAccountBundle('alice', 'standard_8192')
    const encZero = await encryptScalar(alice, 0)
    const encTopup = await encryptScalar(alice, 100000)
    const encQty = await encryptScalar(alice, 2)
    const encMeta = await encryptMetadataVector(alice, 1, 2, 1)
    const encBatch = await encryptVector(alice, [2, 1])

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      // Security boundary check: secret_key must never appear in any HTTP payload
      expect(bodyStr).not.toContain(alice.secret_key_b64)

      if (url.endsWith('/activate')) {
        return new Response(
          JSON.stringify({
            status: 'activated',
            user_id: 'alice',
            balance_ct_b64: encZero.ciphertextBase64,
          }),
          { status: 201 }
        )
      }
      if (url.endsWith('/balance/alice')) {
        return new Response(
          JSON.stringify({
            user_id: 'alice',
            balance_ct_b64: encTopup.ciphertextBase64,
          }),
          { status: 200 }
        )
      }
      if (url.endsWith('/topup')) {
        return new Response(
          JSON.stringify({
            user_id: 'alice',
            balance_ct_b64: encTopup.ciphertextBase64,
          }),
          { status: 200 }
        )
      }
      if (url.endsWith('/transact')) {
        return new Response(
          JSON.stringify({
            transaction_id: 'TXN-1',
            user_id: 'alice',
            bill_ct_b64: encQty.ciphertextBase64,
            balance_ct_b64: encTopup.ciphertextBase64,
          }),
          { status: 200 }
        )
      }
      if (url.endsWith('/transactions/alice')) {
        return new Response(
          JSON.stringify({
            user_id: 'alice',
            transactions: [
              {
                transaction_id: 'TXN-1',
                timestamp: '2026-11-21T08:00:00.000Z',
                metadata_ct_b64: encMeta.ciphertextBase64,
                bill_ct_b64: encQty.ciphertextBase64,
              },
            ],
          }),
          { status: 200 }
        )
      }
      if (url.endsWith('/batch-transact')) {
        return new Response(
          JSON.stringify({
            user_id: 'alice',
            batch_size: 2,
            bills_ct_b64: encBatch.ciphertextBase64,
          }),
          { status: 200 }
        )
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const client = createApiClient(() => ({ baseUrl: 'http://localhost:3000/api' }))

    const act = await client.activate({
      user_id: 'alice',
      ckks_profile: 'standard_8192',
      params_b64: alice.params_b64,
      public_key_b64: alice.public_key_b64,
      relin_key_b64: alice.relin_key_b64,
      initial_balance_ct_b64: encZero.ciphertextBase64,
    })
    expect(act.status).toBe('activated')

    const bal = await client.checkBalance('alice')
    const decBal = await decryptScalar(alice, bal.balance_ct_b64)
    expect(Math.abs(decBal.rawValue - 100000)).toBeLessThan(0.05)

    await client.topup({ user_id: 'alice', amount_ct_b64: encTopup.ciphertextBase64 })
    await client.transact({
      user_id: 'alice',
      product_id: 'CAKE-STRW',
      discount_code: 'REF10_500',
      quantity_ct_b64: encQty.ciphertextBase64,
      metadata_ct_b64: encMeta.ciphertextBase64,
    })
    const hist = await client.getTransactions('alice')
    expect(hist.transactions).toHaveLength(1)

    const batch = await client.batchTransact({
      user_id: 'alice',
      batch_size: 2,
      items: [
        { slot_index: 0, product_id: 'CAKE-STRW', discount_code: 'REF10_500' },
        { slot_index: 1, product_id: 'CAKE-CHOC', discount_code: 'NONE' },
      ],
      quantities_ct_b64: encBatch.ciphertextBase64,
    })
    const decSlots = await decryptVector(alice, batch.bills_ct_b64, 2)
    expect(Math.round(decSlots.slots[0])).toBe(2)
    expect(Math.round(decSlots.slots[1])).toBe(1)

    // Inactive user -> 404 ApiError
    await expect(client.checkBalance('missing_user')).rejects.toThrow(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(7)
  }, 20000)
})
