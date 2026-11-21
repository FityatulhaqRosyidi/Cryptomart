# Cryptomart Backend REST API Specification

This document describes every HTTP REST API endpoint called by the **Cryptomart Vue 3 Frontend** (`src/services/apiClient.ts`), along with exact JSON request/response schemas, HTTP status codes, CKKS serialization details, and the homomorphic evaluation algorithm required on the backend.

---

## 1. Base Configuration & Transport

- **Default Base URL**: `http://localhost:3000/api` (configurable via `VITE_API_BASE_URL` or the UI top bar)
- **Content-Type**: `application/json`
- **Accept**: `application/json`
- **CORS**: Backend must allow CORS requests from the Vite dev/preview origin (e.g., `http://localhost:5173`).

### Standard Error Response Format
For `400 Bad Request` or `404 Not Found` responses, the frontend reads the `error` field if present:
```json
{
  "error": "Human-readable explanation of validation or lookup failure."
}
```

### Status Code Rules
- `200 OK` / `201 Created`: Operation succeeded.
- `400 Bad Request`: Malformed JSON, missing required fields, invalid Base64, deserialization failure, context/parameter mismatch, unknown `product_id` / `discount_code`, or batch capacity exceeded.
- `404 Not Found`: Requested `user_id` has not been activated yet (`CheckBalance`, `Topup`, `Transact`, `GetTransact`, `BatchTransact`).
- If any request fails or is rejected, the server **must not** partially modify the account's balance or transaction history.

---

## 2. CKKS Serialization & Parameter Compatibility

The frontend runs **Microsoft SEAL** via `node-seal` (`v5.1.7`, WebAssembly) directly in the browser.

- **Binary Serialization**: Uses Microsoft SEAL's native binary format compressed with **`zstd`** (`ComprModeType.zstd`), then encoded as standard **Base64** strings inside JSON.
- **Recommended Backend FHE Libraries for 100% Native Binary Compatibility**:
  - **Node.js / TypeScript**: `node-seal` (`v5.1.7`) — identical SEAL C++/WASM serialization format (`params.load(b64)`, `pk.load(context, b64)`, `rk.load(context, b64)`, `ct.load(context, b64)`).
  - **C++**: `Microsoft SEAL` (v4.x) — wire-compatible binary serialization when base64-decoded.
- **Trust Boundary**:
  - The client **NEVER** sends `secret_key` (`sk`) to the server.
  - The server **NEVER** performs decryption or exposes any decryption endpoint.
  - The server stores `(ckks_profile, params_b64, public_key_b64, relin_key_b64, balance_ct_b64, transactions[])` per `user_id` in persistent storage (e.g., SQLite, PostgreSQL, or JSON file).

### Parameter Profiles (`src/config/ckksProfiles.ts`)

| Profile ID | `polyModulusDegree` ($N$) | `coeffModulusBitSizes` | `scaleBits` ($\Delta = 2^b$) | Security Level | Slots ($N/2$) | Multiplicative Depth |
|---|---|---|---|---|---|---|
| `standard_8192` | `8192` | `[60, 40, 40, 60]` | `40` | `tc128` (128-bit) | `4096` | `2` |
| `high_precision_16384` | `16384` | `[60, 45, 45, 45, 60]` | `45` | `tc128` (128-bit) | `8192` | `3` |

---

## 3. REST API Endpoints

### 3.1 `GET /api/catalog` (Optional / Recommended Helper)
Fetches the non-sensitive product catalog and discount rules so the client's numeric ID mapping stays synchronized with the server. (If unavailable, the frontend falls back to `src/config/catalogDefaults.ts`).

**Response (`200 OK`)**:
```json
{
  "products": [
    {
      "product_id": "CAKE-STRW",
      "numeric_id": 1,
      "name": "Strawberry Shortcake",
      "category": "Bakery",
      "unit_price": 12500,
      "description": "Reference test item (Rp 12.500) matching specification example."
    }
  ],
  "discounts": [
    {
      "discount_code": "NONE",
      "numeric_id": 0,
      "label": "No Discount (d = 0, k = 0)",
      "percentage_discount": 0,
      "fixed_cut": 0
    },
    {
      "discount_code": "REF10_500",
      "numeric_id": 1,
      "label": "Reference Promo: 10% + Rp 500 Cut",
      "percentage_discount": 0.1,
      "fixed_cut": 500
    }
  ]
}
```

---

### 3.2 `POST /api/activate` — Activate Account (`Activate`)
Registers a user account on the server with their public CKKS parameters, public key (`pk`), relinearization keys (`rk`), and encrypted initial zero balance.

**Request Body**:
```json
{
  "user_id": "alice",
  "ckks_profile": "standard_8192",
  "params_b64": "<Base64 SEAL EncryptionParameters>",
  "public_key_b64": "<Base64 SEAL PublicKey>",
  "relin_key_b64": "<Base64 SEAL RelinKeys>",
  "initial_balance_ct_b64": "<Base64 SEAL Ciphertext Enc_pk(0.0)>"
}
```

**Backend Validation**:
1. Verify all fields are non-empty strings and `ckks_profile` is valid.
2. Load `params_b64` into `SEALContext` with `tc128` security check (`context.parametersSet() === true`).
3. Verify `public_key_b64`, `relin_key_b64`, and `initial_balance_ct_b64` deserialize cleanly under that `context`.
4. Persist the account record keyed by `user_id`.

**Response (`201 Created` or `200 OK`)**:
```json
{
  "status": "activated",
  "user_id": "alice",
  "balance_ct_b64": "<Base64 SEAL Ciphertext>",
  "server_eval_ms": 1.24
}
```

---

### 3.3 `GET /api/balance/:userId` — Check Encrypted Balance (`CheckBalance`)
Returns the user's current encrypted balance ciphertext. The client decrypts it locally using `sk`.

**Path Parameter**:
- `userId` (`string`): URL-encoded user ID.

**Response (`200 OK`)**:
```json
{
  "user_id": "alice",
  "balance_ct_b64": "<Base64 SEAL Ciphertext>",
  "ckks_profile": "standard_8192"
}
```

**Error Responses**:
- `404 Not Found` if `userId` is not activated.

---

### 3.4 `POST /api/topup` — Homomorphic Balance Top-Up (`Topup`)
Adds an encrypted top-up nominal (`amount_ct_b64`) to the user's stored encrypted balance (`balance_ct_b64`) homomorphically.

**Request Body**:
```json
{
  "user_id": "alice",
  "amount_ct_b64": "<Base64 SEAL Ciphertext Enc_pk(amount)>"
}
```

**Backend Evaluation**:
1. Look up `user_id` (`404` if missing).
2. Load user's `context`, stored `ct_bal`, and incoming `ct_amt` (`400` if invalid Base64 or context mismatch).
3. Align modulus level (`cipherModSwitchTo` to the lower `coeffModulusSize`) and align scale (`ct_other.setScale(ct_target.scale)`).
4. Compute `ct_bal_new = evaluator.add(ct_bal, ct_amt)`.
5. Persist `ct_bal_new` and return it.

**Response (`200 OK`)**:
```json
{
  "user_id": "alice",
  "balance_ct_b64": "<Base64 SEAL Ciphertext>",
  "server_eval_ms": 2.15
}
```

---

### 3.5 `POST /api/transact` — Encrypted Purchase (`Transact`)
> **Note regarding Assignment Spec Table 2.4**: Table 2.4 in the assignment PDF contains a copy-paste typo in the `Transact` row mentioning "ciphertext nominal pengisian saldo". Per Sections 2.2 & 2.4 (pp. 14, 18–20, Algorithm 1), `Transact` takes `user_id`, plaintext `product_id` and `discount_code` (for catalog lookup), encrypted `quantity_ct_b64`, and encrypted `metadata_ct_b64` (`[product_numeric_id, quantity, discount_numeric_id]`).

**Request Body**:
```json
{
  "user_id": "alice",
  "product_id": "CAKE-STRW",
  "discount_code": "REF10_500",
  "quantity_ct_b64": "<Base64 SEAL Ciphertext Enc_pk(q)>",
  "metadata_ct_b64": "<Base64 SEAL Ciphertext Enc_pk([prod_num_id, q, disc_num_id])>"
}
```

**Backend Homomorphic Evaluation (Algorithm 1)**:
1. Validate `user_id` (`404` if inactive), `product_id` (`400` if unknown), and `discount_code` (`400` if unknown).
2. Load `context`, `pk`, `rk`, stored `c_b` (`balance_ct_b64`), `c_q` (`quantity_ct_b64`), and validate `c_m` (`metadata_ct_b64`) deserializes under `context`.
3. Look up unit price $p$, percentage discount $d \in [0, 1]$, and fixed cut $k \ge 0$ from the server catalog.
4. Encode & encrypt using user's `pk` at the profile's `scale`:
   - $c_p \leftarrow \text{Enc}_{pk}(p)$
   - $c_d \leftarrow \text{Enc}_{pk}(1 - d)$
   - $c_k \leftarrow \text{Enc}_{pk}(k)$
5. First ciphertext × ciphertext multiplication:
   - $c_u \leftarrow \text{multiply}(c_p, c_q)$
   - $\text{relinearize}(c_u, rk)$
   - $\text{rescaleToNext}(c_u)$
6. Align $c_d$ to $c_u$'s modulus level (`cipherModSwitchTo(c_d, c_u.parmsId)`) and scale (`c_d.setScale(c_u.scale)`).
7. Second ciphertext × ciphertext multiplication:
   - $c_v \leftarrow \text{multiply}(c_u, c_d)$
   - $\text{relinearize}(c_v, rk)$
   - $\text{rescaleToNext}(c_v)$
8. Align $c_k$ and $c_v$ to the same modulus level & scale, then subtract fixed cut:
   - $c_t \leftarrow \text{sub}(c_v, c_k)$
9. Align $c_b$ and $c_t$ to the same modulus level & scale, then update balance (do **not** check balance sufficiency; negative balances are allowed and detected by client after decryption):
   - $c_b' \leftarrow \text{sub}(c_b, c_t)$
10. **Atomically** persist the updated `balance_ct_b64` ($c_b'$) AND append `{ transaction_id, timestamp, metadata_ct_b64, bill_ct_b64 }` to the user's transaction history.

**Response (`200 OK` or `201 Created`)**:
```json
{
  "transaction_id": "TXN-1732170000000-AB12C",
  "user_id": "alice",
  "bill_ct_b64": "<Base64 SEAL Ciphertext c_t>",
  "balance_ct_b64": "<Base64 SEAL Ciphertext c_b'>",
  "timestamp": "2026-11-21T07:45:00.000Z",
  "server_eval_ms": 14.82
}
```

---

### 3.6 `GET /api/transactions/:userId` — Fetch Encrypted History (`GetTransact`)
Returns all recorded encrypted transactions for `userId`.

**Path Parameter**:
- `userId` (`string`): URL-encoded user ID.

**Response (`200 OK`)**:
```json
{
  "user_id": "alice",
  "transactions": [
    {
      "transaction_id": "TXN-1732170000000-AB12C",
      "timestamp": "2026-11-21T07:45:00.000Z",
      "metadata_ct_b64": "<Base64 SEAL Ciphertext>",
      "bill_ct_b64": "<Base64 SEAL Ciphertext>"
    }
  ]
}
```

---

### 3.7 `POST /api/batch-transact` — Bonus: SIMD Batch Bill Evaluation
Evaluates $m$ independent bills in parallel inside a **single CKKS ciphertext** using slots $0 \dots m-1$ (remaining slots zero-padded). Does **not** modify balance or transaction history.

**Request Body**:
```json
{
  "user_id": "alice",
  "batch_size": 4,
  "items": [
    { "slot_index": 0, "product_id": "CAKE-STRW", "discount_code": "REF10_500" },
    { "slot_index": 1, "product_id": "CAKE-CHOC", "discount_code": "NONE" },
    { "slot_index": 2, "product_id": "CAKE-MTC", "discount_code": "PERCENT15" },
    { "slot_index": 3, "product_id": "COFF-ESP", "discount_code": "FLAT2500" }
  ],
  "quantities_ct_b64": "<Base64 SEAL Ciphertext Enc_pk([q0, q1, q2, q3, 0, ...])>"
}
```

**Backend Evaluation**:
1. Validate `1 <= batch_size <= N/2` (`400 Bad Request` if exceeding slot capacity or `items.length !== batch_size`).
2. Build plaintext Float64 vectors of length `batch_size`:
   - $\vec{p} = [p_0, \dots, p_{m-1}]$
   - $\vec{d} = [1 - d_0, \dots, 1 - d_{m-1}]$
   - $\vec{k} = [k_0, \dots, k_{m-1}]$
3. Encrypt $\vec{p}, \vec{d}, \vec{k}$ using user's `pk` into 3 ciphertexts (`c_p`, `c_d`, `c_k`).
4. Run the exact same two-level SIMD homomorphic evaluation as `/api/transact` (`multiply -> relinearize -> rescale` twice, then subtract `c_k`), producing a single ciphertext `bills_ct_b64`.

**Response (`200 OK`)**:
```json
{
  "user_id": "alice",
  "batch_size": 4,
  "bills_ct_b64": "<Base64 SEAL Ciphertext Enc([t0, t1, t2, t3, ...])>",
  "server_eval_ms": 15.10
}
```
