export type CkksProfileId = 'standard_8192' | 'high_precision_16384'

export interface CkksProfileConfig {
  id: CkksProfileId
  name: string
  description: string
  polyModulusDegree: number
  coeffModulusBitSizes: number[]
  scaleBits: number
  securityLevel: 'tc128' | 'tc192' | 'tc256'
  compressionMode: 'none' | 'zlib' | 'zstd'
  multiplicativeDepth: number
  slotCount: number
}

export interface ProductItem {
  product_id: string
  numeric_id: number
  name: string
  category: string
  unit_price: number
  description: string
}

export interface DiscountRule {
  discount_code: string
  numeric_id: number
  label: string
  percentage_discount: number // d in [0, 1]
  fixed_cut: number // k >= 0
}

export interface ArtifactSizes {
  paramsBinaryBytes: number
  paramsBase64Bytes: number
  secretKeyBinaryBytes: number
  secretKeyBase64Bytes: number
  publicKeyBinaryBytes: number
  publicKeyBase64Bytes: number
  relinKeyBinaryBytes: number
  relinKeyBase64Bytes: number
}

export interface ClientAccountBundle {
  user_id: string
  profile_id: CkksProfileId
  params_b64: string
  secret_key_b64: string
  public_key_b64: string
  relin_key_b64: string
  activated_on_server: boolean
  created_at: string
  keygen_ms: number
  artifact_sizes: ArtifactSizes
  last_balance_ct_b64?: string
  last_decrypted_balance?: number
  reference_balance?: number
}

export interface DecryptedScalarResult {
  rawValue: number
  roundedDisplay: string
  ciphertextBase64: string
  ciphertextPreview: string
  ciphertextBinaryBytes: number
  ciphertextBase64Bytes: number
  clientCryptoMs: number
}

export interface DecryptedMetadataResult {
  productNumericIdRaw: number
  productNumericIdRounded: number
  productId: string
  productName: string
  quantityRaw: number
  quantityRounded: number
  discountNumericIdRaw: number
  discountNumericIdRounded: number
  discountCode: string
  maxIdRoundingError: number
  withinTolerance: boolean
}

export interface TransactionRecordView {
  transaction_id: string
  timestamp: string
  metadata_ct_b64: string
  metadata_preview: string
  bill_ct_b64: string
  bill_preview: string
  decrypted_metadata: DecryptedMetadataResult
  decrypted_bill: DecryptedScalarResult
}

export interface ApiLogEntry {
  id: string
  timestamp: string
  serviceName: string
  method: 'GET' | 'POST'
  url: string
  status: number
  durationMs: number
  requestBody?: unknown
  responseBody?: unknown
  error?: string
}

export interface PerformanceMetricEntry {
  id: string
  timestamp: string
  profileId: CkksProfileId
  operation: 'keygen' | 'activate' | 'check_balance' | 'topup' | 'transact' | 'get_transact' | 'batch_transact'
  clientCryptoMs: number
  serverEvalMs?: number
  endToEndMs: number
  ciphertextBinaryBytes?: number
  ciphertextBase64Bytes?: number
  referenceValue?: number
  decryptedRawValue?: number
  absError?: number
  relError?: number | null
}

// REST API Contracts (Client <-> Backend Server)

export interface ActivateRequest {
  user_id: string
  ckks_profile: CkksProfileId
  params_b64: string
  public_key_b64: string
  relin_key_b64: string
  initial_balance_ct_b64: string
}

export interface ActivateResponse {
  status: string
  user_id: string
  balance_ct_b64: string
  server_eval_ms?: number
}

export interface CheckBalanceResponse {
  user_id: string
  balance_ct_b64: string
  ckks_profile?: CkksProfileId
}

export interface TopupRequest {
  user_id: string
  amount_ct_b64: string
}

export interface TopupResponse {
  user_id: string
  balance_ct_b64: string
  server_eval_ms?: number
}

export interface TransactRequest {
  user_id: string
  product_id: string
  discount_code: string
  quantity_ct_b64: string
  metadata_ct_b64: string
}

export interface TransactResponse {
  transaction_id: string
  user_id: string
  bill_ct_b64: string
  balance_ct_b64: string
  timestamp?: string
  server_eval_ms?: number
}

export interface TransactionHistoryItem {
  transaction_id: string
  timestamp: string
  metadata_ct_b64: string
  bill_ct_b64: string
}

export interface GetTransactResponse {
  user_id: string
  transactions: TransactionHistoryItem[]
}

export interface CatalogResponse {
  products: ProductItem[]
  discounts: DiscountRule[]
}

// Bonus: SIMD Batch Evaluation
export interface BatchTransactItemInput {
  slot_index: number
  product_id: string
  discount_code: string
}

export interface BatchTransactRequest {
  user_id: string
  batch_size: number
  items: BatchTransactItemInput[]
  quantities_ct_b64: string
}

export interface BatchTransactResponse {
  user_id: string
  batch_size: number
  bills_ct_b64: string
  server_eval_ms?: number
}
