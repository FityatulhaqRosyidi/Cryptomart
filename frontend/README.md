# Cryptomart Frontend (Vue 3 + CKKS FHE Client)

Web client for the **IF4020 Cryptography — Tugas 4 (CKKS FHE Online Shop)** assignment. All key generation, encoding, encryption, decryption, and decoding run strictly inside the user's browser using **Microsoft SEAL** compiled to WebAssembly (`node-seal`). The secret key (`sk`) never leaves the client.

---

## Tech Stack & Dependencies

- **Framework**: Vue 3 (`^3.5.13`) + TypeScript (`~5.6.3`) + Vite (`^6.0.1`)
- **Icons**: `lucide-vue-next` (`^0.460.0`)
- **FHE CKKS Library**: `node-seal` (`^5.1.7`) — [https://github.com/s0l0ist/node-seal](https://github.com/s0l0ist/node-seal) (Microsoft SEAL WASM with built-in NTT optimization and RLWE security checks)
- **Testing**: `vitest` (`^2.1.8`)

---

## CKKS Parameter Profiles (`src/config/ckksProfiles.ts`)

Parameter configurations are decoupled from application logic:

1. **`standard_8192` (Profile A — Balanced)**:
   - `polyModulusDegree` ($N$): `8192` (`4096` SIMD slots)
   - `coeffModulusBitSizes`: `[60, 40, 40, 60]` (supports multiplicative depth = 2)
   - `scaleBits`: `40` ($\Delta = 2^{40}$)
   - `securityLevel`: `tc128` (128-bit RLWE security)
   - `compressionMode`: `zstd`
2. **`high_precision_16384` (Profile B — High Precision)**:
   - `polyModulusDegree` ($N$): `16384` (`8192` SIMD slots)
   - `coeffModulusBitSizes`: `[60, 45, 45, 45, 60]` (supports multiplicative depth = 3)
   - `scaleBits`: `45` ($\Delta = 2^{45}$)
   - `securityLevel`: `tc128` (128-bit RLWE security)
   - `compressionMode`: `zstd`

---

## Key Management & File Formats

In the **Key Vault** tab, users can export and re-import local artifacts to reopen an account across sessions without regenerating keys:

- `<user_id>_params.json`: CKKS encryption parameters serialized in `zstd` Base64 (`params_b64`) + `profile_id`.
- `<user_id>_secret.key`: Client-only `SecretKey` serialized in `zstd` Base64 (**never sent over the network**).
- `<user_id>_public.key`: `PublicKey` serialized in `zstd` Base64.
- `<user_id>_relin.key`: `RelinKeys` serialized in `zstd` Base64.
- `<user_id>_local_vault_bundle.json`: Combined local backup JSON for quick re-import.

---

## Running & Testing

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type-check & production build
npm run build

# Run CKKS end-to-end tests (U01-U06, U10, SIMD batch)
npm test
```

### Environment Variables
Copy `.env.example` to `.env` to customize:
```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_DEFAULT_CKKS_PROFILE=standard_8192
```

### Architecture & Backend Integration
All homomorphic evaluation (`Topup` addition, `Transact` two-level bill multiplication, `BatchTransact` SIMD evaluation, and ciphertext storage) is strictly decoupled to the backend REST API at `VITE_API_BASE_URL` (see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)). The frontend performs only client-side key generation, encoding/encryption, decryption/decoding, and HTTP requests to the backend.
