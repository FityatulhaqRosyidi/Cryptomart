import type { CkksProfileConfig, CkksProfileId } from '../types/cryptomart'

/**
 * Separated CKKS Parameter Profiles (not hardcoded into app logic).
 * Both profiles satisfy >= 128-bit RLWE security (SecLevelType.tc128)
 * and support at least 2 consecutive ciphertext-ciphertext multiplications
 * without bootstrapping.
 */
export const CKKS_PROFILES: Record<CkksProfileId, CkksProfileConfig> = {
  standard_8192: {
    id: 'standard_8192',
    name: 'Profile A — Standard (N=8192)',
    description:
      'Balanced latency and artifact size. Supports depth 2 (2 consecutive ct*ct multiplications) with 40-bit scaling factor and 128-bit RLWE security.',
    polyModulusDegree: 8192,
    coeffModulusBitSizes: [60, 40, 40, 60],
    scaleBits: 40,
    securityLevel: 'tc128',
    compressionMode: 'zstd',
    multiplicativeDepth: 2,
    slotCount: 4096,
  },
  high_precision_16384: {
    id: 'high_precision_16384',
    name: 'Profile B — High Precision (N=16384)',
    description:
      'Higher fractional precision and deeper modulus chain (depth 3) using N=16384 and 45-bit scaling factor at 128-bit RLWE security.',
    polyModulusDegree: 16384,
    coeffModulusBitSizes: [60, 45, 45, 45, 60],
    scaleBits: 45,
    securityLevel: 'tc128',
    compressionMode: 'zstd',
    multiplicativeDepth: 3,
    slotCount: 8192,
  },
}

export const DEFAULT_CKKS_PROFILE_ID: CkksProfileId =
  (import.meta.env.VITE_DEFAULT_CKKS_PROFILE as CkksProfileId) || 'standard_8192'

export const DEFAULT_API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

/**
 * Tolerance used when rounding recovered numeric IDs from CKKS approximate decryption.
 */
export const ID_RECOVERY_TOLERANCE = 0.05

/**
 * Acceptable numerical approximation error threshold for monetary verification.
 */
export const MONETARY_ERROR_TOLERANCE = 0.01
