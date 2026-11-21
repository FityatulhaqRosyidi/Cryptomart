import SEAL from 'node-seal'
import type { SEALLibrary } from 'node-seal/implementation/seal'
import type {
  ArtifactSizes,
  CkksProfileConfig,
  CkksProfileId,
  ClientAccountBundle,
  DecryptedMetadataResult,
  DecryptedScalarResult,
  DiscountRule,
  ProductItem,
} from '../types/cryptomart'
import { CKKS_PROFILES, ID_RECOVERY_TOLERANCE } from '../config/ckksProfiles'

let sealInstancePromise: Promise<SEALLibrary> | null = null

export async function getSeal(): Promise<SEALLibrary> {
  if (!sealInstancePromise) {
    sealInstancePromise = SEAL()
  }
  return sealInstancePromise
}

export function formatBase64Preview(b64: string, head = 28, tail = 16): string {
  if (!b64) return ''
  if (b64.length <= head + tail + 5) return b64
  return `${b64.slice(0, head)}...${b64.slice(-tail)}`
}

export function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length
}

export function computeErrorMetrics(
  reference: number,
  decryptedRaw: number
): { absError: number; relError: number | null } {
  const absError = Math.abs(reference - decryptedRaw)
  if (reference === 0) {
    return { absError, relError: null }
  }
  return {
    absError,
    relError: absError / Math.abs(reference),
  }
}

export function resolveSecurityLevel(
  seal: SEALLibrary,
  level: CkksProfileConfig['securityLevel']
) {
  switch (level) {
    case 'tc128':
      return seal.SecurityLevel.tc128
    case 'tc192':
      return seal.SecurityLevel.tc192
    case 'tc256':
      return seal.SecurityLevel.tc256
  }
}

export function resolveCompressionMode(
  seal: SEALLibrary,
  mode: CkksProfileConfig['compressionMode']
) {
  switch (mode) {
    case 'none':
      return seal.ComprModeType.none
    case 'zlib':
      return seal.ComprModeType.zlib
    case 'zstd':
      return seal.ComprModeType.zstd
  }
}

/**
 * Reconstructs SEALContext from Base64-serialized EncryptionParameters.
 */
export async function loadContextFromParamsBase64(
  paramsB64: string,
  securityLevel: CkksProfileConfig['securityLevel'] = 'tc128'
) {
  const seal = await getSeal()
  const params = seal.EncryptionParameters(seal.SchemeType.ckks)
  params.load(paramsB64)
  const context = seal.Context(params, true, resolveSecurityLevel(seal, securityLevel))
  if (!context.parametersSet()) {
    params.delete()
    context.delete()
    throw new Error('Invalid CKKS encryption parameters: security or parameter validation failed.')
  }
  return { seal, params, context }
}

/**
 * Generates a fresh set of CKKS parameters, SecretKey (sk), PublicKey (pk),
 * and RelinearizationKeys (rk) strictly on the client.
 */
export async function generateClientAccountBundle(
  userId: string,
  profileId: CkksProfileId
): Promise<ClientAccountBundle> {
  const profile = CKKS_PROFILES[profileId]
  const seal = await getSeal()
  const t0 = performance.now()

  const params = seal.EncryptionParameters(seal.SchemeType.ckks)
  params.setPolyModulusDegree(profile.polyModulusDegree)
  const coeffVec = seal.CoeffModulus.Create(
    profile.polyModulusDegree,
    Int32Array.from(profile.coeffModulusBitSizes)
  )
  params.setCoeffModulus(coeffVec)
  coeffVec.delete()

  const context = seal.Context(
    params,
    true,
    resolveSecurityLevel(seal, profile.securityLevel)
  )

  if (!context.parametersSet()) {
    params.delete()
    context.delete()
    throw new Error(`Invalid CKKS profile configuration: ${profile.id}`)
  }

  const keygen = seal.KeyGenerator(context)
  const secretKey = keygen.secretKey()
  const publicKey = keygen.createPublicKey()
  const relinKeys = keygen.createRelinKeys()

  const compr = resolveCompressionMode(seal, profile.compressionMode)

  const paramsB64 = params.save(compr)
  const secretKeyB64 = secretKey.save(compr)
  const publicKeyB64 = publicKey.save(compr)
  const relinKeyB64 = relinKeys.save(compr)

  const paramsArr = params.saveArray(compr)
  const skArr = secretKey.saveArray(compr)
  const pkArr = publicKey.saveArray(compr)
  const rkArr = relinKeys.saveArray(compr)

  const artifact_sizes: ArtifactSizes = {
    paramsBinaryBytes: paramsArr.byteLength,
    paramsBase64Bytes: utf8ByteLength(paramsB64),
    secretKeyBinaryBytes: skArr.byteLength,
    secretKeyBase64Bytes: utf8ByteLength(secretKeyB64),
    publicKeyBinaryBytes: pkArr.byteLength,
    publicKeyBase64Bytes: utf8ByteLength(publicKeyB64),
    relinKeyBinaryBytes: rkArr.byteLength,
    relinKeyBase64Bytes: utf8ByteLength(relinKeyB64),
  }

  const keygenMs = performance.now() - t0

  params.delete()
  context.delete()
  keygen.delete()
  secretKey.delete()
  publicKey.delete()
  relinKeys.delete()

  return {
    user_id: userId,
    profile_id: profileId,
    params_b64: paramsB64,
    secret_key_b64: secretKeyB64,
    public_key_b64: publicKeyB64,
    relin_key_b64: relinKeyB64,
    activated_on_server: false,
    created_at: new Date().toISOString(),
    keygen_ms: keygenMs,
    artifact_sizes,
  }
}

/**
 * Validates imported key artifacts (params, sk, pk, rk) by loading them into SEAL
 * and confirming compatibility and artifact sizes.
 */
export async function validateAndMeasureImportedBundle(
  userId: string,
  profileId: CkksProfileId,
  paramsB64: string,
  secretKeyB64: string,
  publicKeyB64: string,
  relinKeyB64: string
): Promise<ClientAccountBundle> {
  const profile = CKKS_PROFILES[profileId]
  const { seal, params, context } = await loadContextFromParamsBase64(
    paramsB64,
    profile.securityLevel
  )

  const sk = seal.SecretKey()
  const pk = seal.PublicKey()
  const rk = seal.RelinKeys()

  try {
    sk.load(context, secretKeyB64)
    pk.load(context, publicKeyB64)
    rk.load(context, relinKeyB64)

    // Verify sk/pk pair consistency with a quick self-check encrypt/decrypt of 42.0
    const encoder = seal.CKKSEncoder(context)
    const encryptor = seal.Encryptor(context, pk)
    const decryptor = seal.Decryptor(context, sk)
    const plain = seal.PlainText()
    const ct = seal.CipherText()
    const plainOut = seal.PlainText()
    try {
      encoder.encode(Float64Array.from([42.0]), Math.pow(2, profile.scaleBits), plain)
      encryptor.encrypt(plain, ct)
      decryptor.decrypt(ct, plainOut)
      const decoded = encoder.decode(plainOut)
      if (Math.abs(decoded[0] - 42.0) > 0.5) {
        throw new Error('Secret key does not match public key / parameters.')
      }
    } finally {
      encoder.delete()
      encryptor.delete()
      decryptor.delete()
      plain.delete()
      ct.delete()
      plainOut.delete()
    }

    const compr = resolveCompressionMode(seal, profile.compressionMode)
    const artifact_sizes: ArtifactSizes = {
      paramsBinaryBytes: params.saveArray(compr).byteLength,
      paramsBase64Bytes: utf8ByteLength(paramsB64),
      secretKeyBinaryBytes: sk.saveArray(compr).byteLength,
      secretKeyBase64Bytes: utf8ByteLength(secretKeyB64),
      publicKeyBinaryBytes: pk.saveArray(compr).byteLength,
      publicKeyBase64Bytes: utf8ByteLength(publicKeyB64),
      relinKeyBinaryBytes: rk.saveArray(compr).byteLength,
      relinKeyBase64Bytes: utf8ByteLength(relinKeyB64),
    }

    return {
      user_id: userId,
      profile_id: profileId,
      params_b64: paramsB64,
      secret_key_b64: secretKeyB64,
      public_key_b64: publicKeyB64,
      relin_key_b64: relinKeyB64,
      activated_on_server: true,
      created_at: new Date().toISOString(),
      keygen_ms: 0,
      artifact_sizes,
    }
  } finally {
    sk.delete()
    pk.delete()
    rk.delete()
    params.delete()
    context.delete()
  }
}

/**
 * Encodes and encrypts a vector of floats using the client's public key.
 */
export async function encryptVector(
  bundle: ClientAccountBundle,
  values: number[]
): Promise<{
  ciphertextBase64: string
  binaryBytes: number
  base64Bytes: number
  clientCryptoMs: number
}> {
  const profile = CKKS_PROFILES[bundle.profile_id]
  const t0 = performance.now()
  const { seal, params, context } = await loadContextFromParamsBase64(
    bundle.params_b64,
    profile.securityLevel
  )

  const pk = seal.PublicKey()
  const encoder = seal.CKKSEncoder(context)
  const plain = seal.PlainText()
  const ct = seal.CipherText()

  try {
    pk.load(context, bundle.public_key_b64)
    const encryptor = seal.Encryptor(context, pk)
    try {
      const scale = Math.pow(2, profile.scaleBits)
      encoder.encode(Float64Array.from(values), scale, plain)
      encryptor.encrypt(plain, ct)
      const compr = resolveCompressionMode(seal, profile.compressionMode)
      const ciphertextBase64 = ct.save(compr)
      const binaryBytes = ct.saveArray(compr).byteLength
      const clientCryptoMs = performance.now() - t0
      return {
        ciphertextBase64,
        binaryBytes,
        base64Bytes: utf8ByteLength(ciphertextBase64),
        clientCryptoMs,
      }
    } finally {
      encryptor.delete()
    }
  } finally {
    ct.delete()
    plain.delete()
    encoder.delete()
    pk.delete()
    params.delete()
    context.delete()
  }
}

export async function encryptScalar(bundle: ClientAccountBundle, value: number) {
  return encryptVector(bundle, [value])
}

/**
 * Encrypts transaction metadata vector: [product_numeric_id, quantity, discount_numeric_id].
 */
export async function encryptMetadataVector(
  bundle: ClientAccountBundle,
  productNumericId: number,
  quantity: number,
  discountNumericId: number
) {
  return encryptVector(bundle, [productNumericId, quantity, discountNumericId])
}

/**
 * Decrypts and decodes a Base64 CKKS ciphertext into its raw Float64Array slots
 * strictly on the client using the local SecretKey (sk).
 */
export async function decryptVector(
  bundle: ClientAccountBundle,
  ciphertextBase64: string,
  takeSlots = 1
): Promise<{
  slots: number[]
  binaryBytes: number
  base64Bytes: number
  clientCryptoMs: number
}> {
  const profile = CKKS_PROFILES[bundle.profile_id]
  const t0 = performance.now()
  const { seal, params, context } = await loadContextFromParamsBase64(
    bundle.params_b64,
    profile.securityLevel
  )

  const sk = seal.SecretKey()
  const ct = seal.CipherText()
  const plain = seal.PlainText()
  const encoder = seal.CKKSEncoder(context)

  try {
    sk.load(context, bundle.secret_key_b64)
    ct.load(context, ciphertextBase64)
    const compr = resolveCompressionMode(seal, profile.compressionMode)
    const binaryBytes = ct.saveArray(compr).byteLength
    const decryptor = seal.Decryptor(context, sk)
    try {
      decryptor.decrypt(ct, plain)
      const decoded = encoder.decode(plain)
      const slots: number[] = []
      const count = Math.min(takeSlots, decoded.length)
      for (let i = 0; i < count; i++) {
        slots.push(decoded[i])
      }
      const clientCryptoMs = performance.now() - t0
      return {
        slots,
        binaryBytes,
        base64Bytes: utf8ByteLength(ciphertextBase64),
        clientCryptoMs,
      }
    } finally {
      decryptor.delete()
    }
  } finally {
    encoder.delete()
    plain.delete()
    ct.delete()
    sk.delete()
    params.delete()
    context.delete()
  }
}

export async function decryptScalar(
  bundle: ClientAccountBundle,
  ciphertextBase64: string
): Promise<DecryptedScalarResult> {
  const res = await decryptVector(bundle, ciphertextBase64, 1)
  const rawValue = res.slots[0] ?? 0
  return {
    rawValue,
    roundedDisplay: formatCurrency(rawValue),
    ciphertextBase64,
    ciphertextPreview: formatBase64Preview(ciphertextBase64),
    ciphertextBinaryBytes: res.binaryBytes,
    ciphertextBase64Bytes: res.base64Bytes,
    clientCryptoMs: res.clientCryptoMs,
  }
}

export async function decryptMetadata(
  bundle: ClientAccountBundle,
  metadataCtB64: string,
  products: ProductItem[],
  discounts: DiscountRule[]
): Promise<DecryptedMetadataResult> {
  const res = await decryptVector(bundle, metadataCtB64, 3)
  const productNumericIdRaw = res.slots[0] ?? 0
  const quantityRaw = res.slots[1] ?? 0
  const discountNumericIdRaw = res.slots[2] ?? 0

  const productNumericIdRounded = Math.round(productNumericIdRaw)
  const quantityRounded = Math.round(quantityRaw * 1000) / 1000
  const discountNumericIdRounded = Math.round(discountNumericIdRaw)

  const errProd = Math.abs(productNumericIdRaw - productNumericIdRounded)
  const errDisc = Math.abs(discountNumericIdRaw - discountNumericIdRounded)
  const maxIdRoundingError = Math.max(errProd, errDisc)

  const product = products.find((p) => p.numeric_id === productNumericIdRounded)
  const discount = discounts.find((d) => d.numeric_id === discountNumericIdRounded)

  return {
    productNumericIdRaw,
    productNumericIdRounded,
    productId: product ? product.product_id : `UNKNOWN(#${productNumericIdRounded})`,
    productName: product ? product.name : `Unmapped Product #${productNumericIdRounded}`,
    quantityRaw,
    quantityRounded,
    discountNumericIdRaw,
    discountNumericIdRounded,
    discountCode: discount ? discount.discount_code : `UNKNOWN(#${discountNumericIdRounded})`,
    maxIdRoundingError,
    withinTolerance: maxIdRoundingError <= ID_RECOVERY_TOLERANCE,
  }
}

export function formatCurrency(value: number): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded)
}
