import { computed, reactive } from 'vue'
import type {
  ApiLogEntry,
  CkksProfileId,
  ClientAccountBundle,
  DecryptedScalarResult,
  DiscountRule,
  PerformanceMetricEntry,
  ProductItem,
  TransactionRecordView,
} from '../types/cryptomart'
import {
  CKKS_PROFILES,
  DEFAULT_API_BASE_URL,
  DEFAULT_CKKS_PROFILE_ID,
} from '../config/ckksProfiles'
import { DEFAULT_DISCOUNTS, DEFAULT_PRODUCTS } from '../config/catalogDefaults'
import {
  computeErrorMetrics,
  decryptMetadata,
  decryptScalar,
  decryptVector,
  encryptMetadataVector,
  encryptScalar,
  encryptVector,
  formatBase64Preview,
  generateClientAccountBundle,
  validateAndMeasureImportedBundle,
} from '../services/ckksService'
import { createApiClient } from '../services/apiClient'

const ACCOUNTS_STORAGE_KEY = 'cryptomart_client_accounts_v1'
const SETTINGS_STORAGE_KEY = 'cryptomart_client_settings_v1'

interface StoredSettings {
  apiBaseUrl: string
  activeUserId: string
}

function loadAccounts(): Record<string, ClientAccountBundle> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ClientAccountBundle>) : {}
  } catch {
    return {}
  }
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings>
      return {
        apiBaseUrl: parsed.apiBaseUrl || DEFAULT_API_BASE_URL,
        activeUserId: parsed.activeUserId || '',
      }
    }
  } catch {
    // ignore
  }
  return {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    activeUserId: '',
  }
}

const initialSettings = loadSettings()

const state = reactive({
  accounts: loadAccounts(),
  activeUserId: initialSettings.activeUserId,
  apiBaseUrl: initialSettings.apiBaseUrl,
  products: [...DEFAULT_PRODUCTS] as ProductItem[],
  discounts: [...DEFAULT_DISCOUNTS] as DiscountRule[],
  catalogSource: 'defaults' as 'defaults' | 'backend',
  latestBalanceResult: null as DecryptedScalarResult | null,
  transactions: [] as TransactionRecordView[],
  apiLogs: [] as ApiLogEntry[],
  metrics: [] as PerformanceMetricEntry[],
  busy: false,
  statusBanner: null as { type: 'success' | 'error' | 'warning' | 'info'; message: string } | null,
})

function persistAccounts() {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(state.accounts))
}

function persistSettings() {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      apiBaseUrl: state.apiBaseUrl,
      activeUserId: state.activeUserId,
    })
  )
}

const apiClient = createApiClient(() => ({
  baseUrl: state.apiBaseUrl,
  onLog: (entry) => {
    state.apiLogs.unshift(entry)
    if (state.apiLogs.length > 100) state.apiLogs.pop()
  },
}))

export function useCryptomartStore() {
  const accountList = computed(() => Object.values(state.accounts))
  const activeAccount = computed<ClientAccountBundle | null>(
    () => (state.activeUserId ? state.accounts[state.activeUserId] ?? null : null)
  )
  const activeProfile = computed(() =>
    activeAccount.value
      ? CKKS_PROFILES[activeAccount.value.profile_id]
      : CKKS_PROFILES[DEFAULT_CKKS_PROFILE_ID]
  )
  const isNegativeBalance = computed(
    () =>
      state.latestBalanceResult !== null && state.latestBalanceResult.rawValue < -0.0001
  )

  function setStatus(type: 'success' | 'error' | 'warning' | 'info', message: string) {
    state.statusBanner = { type, message }
  }

  function updateSettings(patch: Partial<StoredSettings>) {
    if (patch.apiBaseUrl !== undefined) state.apiBaseUrl = patch.apiBaseUrl
    if (patch.activeUserId !== undefined) {
      state.activeUserId = patch.activeUserId
      state.latestBalanceResult = null
      state.transactions = []
    }
    persistSettings()
  }

  async function refreshCatalog() {
    try {
      const res = await apiClient.fetchCatalog()
      if (Array.isArray(res.products) && res.products.length > 0) {
        state.products = res.products
      }
      if (Array.isArray(res.discounts) && res.discounts.length > 0) {
        state.discounts = res.discounts
      }
      state.catalogSource = 'backend'
    } catch {
      state.products = [...DEFAULT_PRODUCTS]
      state.discounts = [...DEFAULT_DISCOUNTS]
      state.catalogSource = 'defaults'
    }
  }

  async function createAndActivateAccount(userId: string, profileId: CkksProfileId) {
    const trimmedId = userId.trim()
    if (!trimmedId) {
      setStatus('error', 'User ID cannot be empty.')
      return
    }
    state.busy = true
    try {
      const e2eStart = performance.now()
      const bundle = await generateClientAccountBundle(trimmedId, profileId)
      state.metrics.unshift({
        id: `m-${Date.now()}-kg`,
        timestamp: new Date().toISOString(),
        profileId,
        operation: 'keygen',
        clientCryptoMs: bundle.keygen_ms,
        endToEndMs: bundle.keygen_ms,
      })

      const encZero = await encryptScalar(bundle, 0.0)
      const res = await apiClient.activate({
        user_id: trimmedId,
        ckks_profile: profileId,
        params_b64: bundle.params_b64,
        public_key_b64: bundle.public_key_b64,
        relin_key_b64: bundle.relin_key_b64,
        initial_balance_ct_b64: encZero.ciphertextBase64,
      })

      const dec = await decryptScalar(bundle, res.balance_ct_b64)
      const e2eMs = performance.now() - e2eStart
      const err = computeErrorMetrics(0, dec.rawValue)

      bundle.activated_on_server = true
      bundle.last_balance_ct_b64 = res.balance_ct_b64
      bundle.last_decrypted_balance = dec.rawValue
      bundle.reference_balance = 0

      state.accounts[trimmedId] = bundle
      state.activeUserId = trimmedId
      state.latestBalanceResult = dec
      state.transactions = []
      persistAccounts()
      persistSettings()

      state.metrics.unshift({
        id: `m-${Date.now()}-act`,
        timestamp: new Date().toISOString(),
        profileId,
        operation: 'activate',
        clientCryptoMs: encZero.clientCryptoMs + dec.clientCryptoMs,
        serverEvalMs: res.server_eval_ms,
        endToEndMs: e2eMs,
        ciphertextBinaryBytes: dec.ciphertextBinaryBytes,
        ciphertextBase64Bytes: dec.ciphertextBase64Bytes,
        referenceValue: 0,
        decryptedRawValue: dec.rawValue,
        absError: err.absError,
        relError: err.relError,
      })

      setStatus(
        'success',
        `Account '${trimmedId}' created (${CKKS_PROFILES[profileId].name}) and activated via backend. Secret key stays local.`
      )
    } catch (err) {
      setStatus('error', (err as Error).message)
    } finally {
      state.busy = false
    }
  }

  async function importExistingAccount(payload: {
    userId: string
    profileId: CkksProfileId
    paramsB64: string
    secretKeyB64: string
    publicKeyB64: string
    relinKeyB64: string
  }) {
    const trimmedId = payload.userId.trim()
    if (!trimmedId) {
      setStatus('error', 'User ID is required for import.')
      return
    }
    state.busy = true
    try {
      const bundle = await validateAndMeasureImportedBundle(
        trimmedId,
        payload.profileId,
        payload.paramsB64.trim(),
        payload.secretKeyB64.trim(),
        payload.publicKeyB64.trim(),
        payload.relinKeyB64.trim()
      )
      state.accounts[trimmedId] = bundle
      state.activeUserId = trimmedId
      state.latestBalanceResult = null
      state.transactions = []
      persistAccounts()
      persistSettings()
      setStatus(
        'success',
        `Imported keys & parameters for '${trimmedId}'. You can now CheckBalance or GetTransact.`
      )
    } catch (err) {
      setStatus('error', `Key import failed: ${(err as Error).message}`)
    } finally {
      state.busy = false
    }
  }

  function removeLocalAccount(userId: string) {
    delete state.accounts[userId]
    if (state.activeUserId === userId) {
      const remaining = Object.keys(state.accounts)
      state.activeUserId = remaining[0] ?? ''
      state.latestBalanceResult = null
      state.transactions = []
    }
    persistAccounts()
    persistSettings()
  }

  async function checkBalance() {
    const acct = activeAccount.value
    if (!acct) {
      setStatus('error', 'Please activate or import an account first.')
      return
    }
    state.busy = true
    try {
      const e2eStart = performance.now()
      const res = await apiClient.checkBalance(acct.user_id)
      const dec = await decryptScalar(acct, res.balance_ct_b64)
      const e2eMs = performance.now() - e2eStart

      acct.last_balance_ct_b64 = res.balance_ct_b64
      acct.last_decrypted_balance = dec.rawValue
      state.latestBalanceResult = dec
      persistAccounts()

      const refVal = acct.reference_balance
      const err =
        refVal !== undefined ? computeErrorMetrics(refVal, dec.rawValue) : undefined

      state.metrics.unshift({
        id: `m-${Date.now()}-bal`,
        timestamp: new Date().toISOString(),
        profileId: acct.profile_id,
        operation: 'check_balance',
        clientCryptoMs: dec.clientCryptoMs,
        endToEndMs: e2eMs,
        ciphertextBinaryBytes: dec.ciphertextBinaryBytes,
        ciphertextBase64Bytes: dec.ciphertextBase64Bytes,
        referenceValue: refVal,
        decryptedRawValue: dec.rawValue,
        absError: err?.absError,
        relError: err?.relError,
      })

      if (dec.rawValue < -0.0001) {
        setStatus(
          'warning',
          `Balance decrypted: ${dec.roundedDisplay} (NEGATIVE BALANCE DETECTED).`
        )
      } else {
        setStatus('success', `Balance decrypted locally: ${dec.roundedDisplay}`)
      }
    } catch (err) {
      setStatus('error', (err as Error).message)
    } finally {
      state.busy = false
    }
  }

  async function topup(amount: number) {
    const acct = activeAccount.value
    if (!acct) {
      setStatus('error', 'Please activate or import an account first.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('error', 'Top-up amount must be a positive number.')
      return
    }
    state.busy = true
    try {
      const e2eStart = performance.now()
      const encAmt = await encryptScalar(acct, amount)
      const res = await apiClient.topup({
        user_id: acct.user_id,
        amount_ct_b64: encAmt.ciphertextBase64,
      })
      const dec = await decryptScalar(acct, res.balance_ct_b64)
      const e2eMs = performance.now() - e2eStart

      const nextRef = (acct.reference_balance ?? 0) + amount
      acct.reference_balance = nextRef
      acct.last_balance_ct_b64 = res.balance_ct_b64
      acct.last_decrypted_balance = dec.rawValue
      state.latestBalanceResult = dec
      persistAccounts()

      const err = computeErrorMetrics(nextRef, dec.rawValue)
      state.metrics.unshift({
        id: `m-${Date.now()}-top`,
        timestamp: new Date().toISOString(),
        profileId: acct.profile_id,
        operation: 'topup',
        clientCryptoMs: encAmt.clientCryptoMs + dec.clientCryptoMs,
        serverEvalMs: res.server_eval_ms,
        endToEndMs: e2eMs,
        ciphertextBinaryBytes: encAmt.binaryBytes,
        ciphertextBase64Bytes: encAmt.base64Bytes,
        referenceValue: nextRef,
        decryptedRawValue: dec.rawValue,
        absError: err.absError,
        relError: err.relError,
      })

      setStatus('success', `Top-up successful. Updated balance: ${dec.roundedDisplay}`)
    } catch (err) {
      setStatus('error', (err as Error).message)
    } finally {
      state.busy = false
    }
  }

  async function executeTransaction(
    productId: string,
    quantity: number,
    discountCode: string
  ) {
    const acct = activeAccount.value
    if (!acct) {
      setStatus('error', 'Please activate or import an account first.')
      return null
    }
    const product = state.products.find((p) => p.product_id === productId)
    const discount = state.discounts.find(
      (d) => d.discount_code === (discountCode || 'NONE')
    )
    if (!product || !discount) {
      setStatus('error', 'Selected product or discount rule not found.')
      return null
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStatus('error', 'Quantity must be greater than zero.')
      return null
    }

    state.busy = true
    try {
      const e2eStart = performance.now()
      const encQty = await encryptScalar(acct, quantity)
      const encMeta = await encryptMetadataVector(
        acct,
        product.numeric_id,
        quantity,
        discount.numeric_id
      )

      const res = await apiClient.transact({
        user_id: acct.user_id,
        product_id: product.product_id,
        discount_code: discount.discount_code,
        quantity_ct_b64: encQty.ciphertextBase64,
        metadata_ct_b64: encMeta.ciphertextBase64,
      })

      const decBill = await decryptScalar(acct, res.bill_ct_b64)
      const decBalance = await decryptScalar(acct, res.balance_ct_b64)
      const e2eMs = performance.now() - e2eStart

      const refBill =
        product.unit_price * quantity * (1 - discount.percentage_discount) -
        discount.fixed_cut
      const nextRefBalance = (acct.reference_balance ?? 0) - refBill

      acct.reference_balance = nextRefBalance
      acct.last_balance_ct_b64 = res.balance_ct_b64
      acct.last_decrypted_balance = decBalance.rawValue
      state.latestBalanceResult = decBalance
      persistAccounts()

      const billErr = computeErrorMetrics(refBill, decBill.rawValue)
      state.metrics.unshift({
        id: `m-${Date.now()}-tx`,
        timestamp: new Date().toISOString(),
        profileId: acct.profile_id,
        operation: 'transact',
        clientCryptoMs:
          encQty.clientCryptoMs +
          encMeta.clientCryptoMs +
          decBill.clientCryptoMs +
          decBalance.clientCryptoMs,
        serverEvalMs: res.server_eval_ms,
        endToEndMs: e2eMs,
        ciphertextBinaryBytes: decBill.ciphertextBinaryBytes,
        ciphertextBase64Bytes: decBill.ciphertextBase64Bytes,
        referenceValue: refBill,
        decryptedRawValue: decBill.rawValue,
        absError: billErr.absError,
        relError: billErr.relError,
      })

      if (decBalance.rawValue < -0.0001) {
        setStatus(
          'warning',
          `Transaction ${res.transaction_id} completed, but decrypted balance is NEGATIVE (${decBalance.roundedDisplay})!`
        )
      } else {
        setStatus(
          'success',
          `Transaction ${res.transaction_id} completed! Bill: ${decBill.roundedDisplay}, Remaining Balance: ${decBalance.roundedDisplay}`
        )
      }

      return {
        transaction_id: res.transaction_id,
        decBill,
        decBalance,
        refBill,
        billAbsError: billErr.absError,
        billRelError: billErr.relError,
        quantityCtPreview: formatBase64Preview(encQty.ciphertextBase64),
        metadataCtPreview: formatBase64Preview(encMeta.ciphertextBase64),
      }
    } catch (err) {
      setStatus('error', (err as Error).message)
      return null
    } finally {
      state.busy = false
    }
  }

  async function fetchTransactions() {
    const acct = activeAccount.value
    if (!acct) {
      setStatus('error', 'Please activate or import an account first.')
      return
    }
    state.busy = true
    try {
      const e2eStart = performance.now()
      const res = await apiClient.getTransactions(acct.user_id)
      const decryptedRows: TransactionRecordView[] = []
      let cryptoMs = 0

      for (const item of res.transactions) {
        const decMeta = await decryptMetadata(
          acct,
          item.metadata_ct_b64,
          state.products,
          state.discounts
        )
        const decBill = await decryptScalar(acct, item.bill_ct_b64)
        cryptoMs += decBill.clientCryptoMs
        decryptedRows.push({
          transaction_id: item.transaction_id,
          timestamp: item.timestamp,
          metadata_ct_b64: item.metadata_ct_b64,
          metadata_preview: formatBase64Preview(item.metadata_ct_b64, 22, 12),
          bill_ct_b64: item.bill_ct_b64,
          bill_preview: formatBase64Preview(item.bill_ct_b64, 22, 12),
          decrypted_metadata: decMeta,
          decrypted_bill: decBill,
        })
      }

      state.transactions = decryptedRows
      const e2eMs = performance.now() - e2eStart

      state.metrics.unshift({
        id: `m-${Date.now()}-gettx`,
        timestamp: new Date().toISOString(),
        profileId: acct.profile_id,
        operation: 'get_transact',
        clientCryptoMs: cryptoMs,
        endToEndMs: e2eMs,
      })

      setStatus(
        'success',
        `Loaded and decrypted ${decryptedRows.length} transaction record(s) locally.`
      )
    } catch (err) {
      setStatus('error', (err as Error).message)
    } finally {
      state.busy = false
    }
  }

  async function runSimdBatch(
    rows: Array<{ product_id: string; quantity: number; discount_code: string }>
  ) {
    const acct = activeAccount.value
    if (!acct) {
      setStatus('error', 'Please activate or import an account first.')
      return null
    }
    state.busy = true
    try {
      const e2eStart = performance.now()
      const quantities = rows.map((r) => r.quantity)
      const encBatch = await encryptVector(acct, quantities)
      const res = await apiClient.batchTransact({
        user_id: acct.user_id,
        batch_size: rows.length,
        items: rows.map((r, idx) => ({
          slot_index: idx,
          product_id: r.product_id,
          discount_code: r.discount_code,
        })),
        quantities_ct_b64: encBatch.ciphertextBase64,
      })
      const decBatch = await decryptVector(acct, res.bills_ct_b64, rows.length)
      const e2eMs = performance.now() - e2eStart

      const slotResults = rows.map((r, idx) => {
        const prod = state.products.find((p) => p.product_id === r.product_id)!
        const disc = state.discounts.find((d) => d.discount_code === r.discount_code)!
        const refBill =
          prod.unit_price * r.quantity * (1 - disc.percentage_discount) - disc.fixed_cut
        const decryptedRaw = decBatch.slots[idx] ?? 0
        const err = computeErrorMetrics(refBill, decryptedRaw)
        return {
          slot: idx,
          product_name: prod.name,
          quantity: r.quantity,
          discount_code: disc.discount_code,
          reference_bill: refBill,
          decrypted_bill: decryptedRaw,
          abs_error: err.absError,
          rel_error: err.relError,
        }
      })

      state.metrics.unshift({
        id: `m-${Date.now()}-batch`,
        timestamp: new Date().toISOString(),
        profileId: acct.profile_id,
        operation: 'batch_transact',
        clientCryptoMs: encBatch.clientCryptoMs + decBatch.clientCryptoMs,
        serverEvalMs: res.server_eval_ms,
        endToEndMs: e2eMs,
        ciphertextBinaryBytes: decBatch.binaryBytes,
        ciphertextBase64Bytes: decBatch.base64Bytes,
      })

      setStatus(
        'success',
        `SIMD Batch evaluated ${rows.length} bills in a single ciphertext (${e2eMs.toFixed(1)} ms end-to-end).`
      )

      return {
        batch_size: rows.length,
        quantities_ct_preview: formatBase64Preview(encBatch.ciphertextBase64),
        bills_ct_b64: res.bills_ct_b64,
        bills_ct_preview: formatBase64Preview(res.bills_ct_b64),
        ciphertextBinaryBytes: decBatch.binaryBytes,
        ciphertextBase64Bytes: decBatch.base64Bytes,
        clientCryptoMs: encBatch.clientCryptoMs + decBatch.clientCryptoMs,
        serverEvalMs: res.server_eval_ms,
        endToEndMs: e2eMs,
        slotResults,
      }
    } catch (err) {
      setStatus('error', (err as Error).message)
      return null
    } finally {
      state.busy = false
    }
  }

  /**
   * Helper for U03 / U09 testing: attempt to decrypt a ciphertext with the CURRENT
   * active account's secret key to observe cross-user decryption behavior.
   */
  async function testDecryptArbitraryCiphertext(ciphertextBase64: string) {
    const acct = activeAccount.value
    if (!acct) throw new Error('No active account selected.')
    return decryptScalar(acct, ciphertextBase64.trim())
  }

  function resetAllLocalData() {
    state.accounts = {}
    state.activeUserId = ''
    state.latestBalanceResult = null
    state.transactions = []
    state.metrics = []
    state.apiLogs = []
    localStorage.removeItem(ACCOUNTS_STORAGE_KEY)
    setStatus('info', 'Cleared local client vault.')
  }

  return {
    state,
    accountList,
    activeAccount,
    activeProfile,
    isNegativeBalance,
    setStatus,
    updateSettings,
    refreshCatalog,
    createAndActivateAccount,
    importExistingAccount,
    removeLocalAccount,
    checkBalance,
    topup,
    executeTransaction,
    fetchTransactions,
    runSimdBatch,
    testDecryptArbitraryCiphertext,
    resetAllLocalData,
  }
}
