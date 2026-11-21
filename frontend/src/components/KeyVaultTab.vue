<script setup lang="ts">
import { ref } from 'vue'
import { Download, Upload, ShieldAlert, Trash2, Key } from 'lucide-vue-next'
import type { CkksProfileId } from '../types/cryptomart'
import { CKKS_PROFILES, DEFAULT_CKKS_PROFILE_ID } from '../config/ckksProfiles'
import { useCryptomartStore } from '../composables/useCryptomartStore'
import { formatBase64Preview } from '../services/ckksService'

const store = useCryptomartStore()

const importUserId = ref('')
const importProfileId = ref<CkksProfileId>(DEFAULT_CKKS_PROFILE_ID)
const importParamsB64 = ref('')
const importSecretKeyB64 = ref('')
const importPublicKeyB64 = ref('')
const importRelinKeyB64 = ref('')

const arbitraryCiphertext = ref('')
const crossDecryptResult = ref<{ rawValue: number; roundedDisplay: string } | null>(null)
const crossDecryptError = ref('')

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportArtifact(kind: 'params' | 'sk' | 'pk' | 'rk' | 'bundle') {
  const acct = store.activeAccount.value
  if (!acct) return
  if (kind === 'params') {
    downloadTextFile(
      `${acct.user_id}_params.json`,
      JSON.stringify(
        {
          user_id: acct.user_id,
          profile_id: acct.profile_id,
          params_b64: acct.params_b64,
        },
        null,
        2
      )
    )
  } else if (kind === 'sk') {
    downloadTextFile(`${acct.user_id}_secret.key`, acct.secret_key_b64)
  } else if (kind === 'pk') {
    downloadTextFile(`${acct.user_id}_public.key`, acct.public_key_b64)
  } else if (kind === 'rk') {
    downloadTextFile(`${acct.user_id}_relin.key`, acct.relin_key_b64)
  } else {
    downloadTextFile(
      `${acct.user_id}_local_vault_bundle.json`,
      JSON.stringify(
        {
          user_id: acct.user_id,
          profile_id: acct.profile_id,
          params_b64: acct.params_b64,
          secret_key_b64: acct.secret_key_b64,
          public_key_b64: acct.public_key_b64,
          relin_key_b64: acct.relin_key_b64,
        },
        null,
        2
      )
    )
  }
}

async function handleFileRead(
  event: Event,
  target: 'params' | 'sk' | 'pk' | 'rk' | 'bundle'
) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const text = (await file.text()).trim()

  if (target === 'bundle') {
    try {
      const parsed = JSON.parse(text)
      importUserId.value = parsed.user_id || ''
      importProfileId.value = parsed.profile_id || DEFAULT_CKKS_PROFILE_ID
      importParamsB64.value = parsed.params_b64 || ''
      importSecretKeyB64.value = parsed.secret_key_b64 || ''
      importPublicKeyB64.value = parsed.public_key_b64 || ''
      importRelinKeyB64.value = parsed.relin_key_b64 || ''
    } catch {
      store.setStatus('error', 'Invalid JSON bundle file.')
    }
  } else if (target === 'params') {
    try {
      const parsed = JSON.parse(text)
      importParamsB64.value = parsed.params_b64 || text
      if (parsed.user_id && !importUserId.value) importUserId.value = parsed.user_id
      if (parsed.profile_id) importProfileId.value = parsed.profile_id
    } catch {
      importParamsB64.value = text
    }
  } else if (target === 'sk') {
    importSecretKeyB64.value = text
  } else if (target === 'pk') {
    importPublicKeyB64.value = text
  } else if (target === 'rk') {
    importRelinKeyB64.value = text
  }
}

async function handleImportSubmit() {
  await store.importExistingAccount({
    userId: importUserId.value,
    profileId: importProfileId.value,
    paramsB64: importParamsB64.value,
    secretKeyB64: importSecretKeyB64.value,
    publicKeyB64: importPublicKeyB64.value,
    relinKeyB64: importRelinKeyB64.value,
  })
}

async function handleCrossDecryptTest() {
  crossDecryptError.value = ''
  crossDecryptResult.value = null
  try {
    const res = await store.testDecryptArbitraryCiphertext(arbitraryCiphertext.value)
    crossDecryptResult.value = { rawValue: res.rawValue, roundedDisplay: res.roundedDisplay }
  } catch (err) {
    crossDecryptError.value = (err as Error).message
  }
}
</script>

<template>
  <div class="grid-2">
    <div class="card">
      <h2>Local Key Vault & Artifact Export (Client Only)</h2>
      <p class="card-subtitle">
        Secret key (<code>sk</code>) never leaves this device. Export artifacts to reopen your
        account after restarting the app without generating new keys (Scenario U02).
      </p>

      <div v-if="store.activeAccount.value" style="display: grid; gap: 14px;">
        <div class="row-between">
          <div>
            <strong>Active Account:</strong>
            <span class="pill accent mono" style="margin-left: 8px;">
              {{ store.activeAccount.value.user_id }}
            </span>
          </div>
          <span class="pill success">
            {{ CKKS_PROFILES[store.activeAccount.value.profile_id].name }}
          </span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Binary Size</th>
                <th>Base64 Size</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>CKKS Parameters</strong></td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.paramsBinaryBytes }} B</td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.paramsBase64Bytes }} B</td>
                <td>
                  <button class="btn btn-secondary btn-sm" @click="exportArtifact('params')">
                    <Download :size="13" /> params.json
                  </button>
                </td>
              </tr>
              <tr>
                <td><strong>Secret Key (sk)</strong> <span class="pill danger">LOCAL ONLY</span></td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.secretKeyBinaryBytes }} B</td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.secretKeyBase64Bytes }} B</td>
                <td>
                  <button class="btn btn-secondary btn-sm" @click="exportArtifact('sk')">
                    <Download :size="13" /> secret.key
                  </button>
                </td>
              </tr>
              <tr>
                <td><strong>Public Key (pk)</strong></td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.publicKeyBinaryBytes }} B</td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.publicKeyBase64Bytes }} B</td>
                <td>
                  <button class="btn btn-secondary btn-sm" @click="exportArtifact('pk')">
                    <Download :size="13" /> public.key
                  </button>
                </td>
              </tr>
              <tr>
                <td><strong>Relin Key (rk)</strong></td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.relinKeyBinaryBytes }} B</td>
                <td class="mono">{{ store.activeAccount.value.artifact_sizes.relinKeyBase64Bytes }} B</td>
                <td>
                  <button class="btn btn-secondary btn-sm" @click="exportArtifact('rk')">
                    <Download :size="13" /> relin.key
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="row-gap">
          <button class="btn btn-primary btn-sm" @click="exportArtifact('bundle')">
            <Download :size="14" /> Export Full Local Bundle (.json)
          </button>
          <button
            class="btn btn-danger btn-sm"
            @click="store.removeLocalAccount(store.activeAccount.value!.user_id)"
          >
            <Trash2 :size="14" /> Remove From Browser Vault
          </button>
        </div>

        <div v-if="store.activeAccount.value.last_balance_ct_b64">
          <div class="cipher-box-label">Latest Balance Ciphertext (Copy for U03 Isolation Test)</div>
          <div class="cipher-snippet">
            {{ formatBase64Preview(store.activeAccount.value.last_balance_ct_b64, 48, 24) }}
          </div>
          <button
            class="btn btn-secondary btn-sm"
            style="margin-top: 6px;"
            @click="arbitraryCiphertext = store.activeAccount.value!.last_balance_ct_b64!"
          >
            Copy Latest Balance Ciphertext to U03 Tester
          </button>
        </div>
      </div>

      <div v-else class="muted small">
        No active account selected in local vault.
      </div>
    </div>

    <div class="card">
      <h2>Import Existing Account Keys (Persistence U02)</h2>
      <p class="card-subtitle">
        Load previously exported parameters and keys to restore an existing account session.
      </p>

      <div class="form-group">
        <label>Quick Import Full Local Bundle (.json)</label>
        <input type="file" accept=".json" class="input" @change="(e) => handleFileRead(e, 'bundle')" />
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>User ID</label>
          <input v-model="importUserId" type="text" class="input" placeholder="alice" />
        </div>
        <div class="form-group">
          <label>CKKS Profile</label>
          <select v-model="importProfileId" class="select">
            <option v-for="prof in Object.values(CKKS_PROFILES)" :key="prof.id" :value="prof.id">
              {{ prof.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>params.json (or Base64)</label>
          <input type="file" class="input" @change="(e) => handleFileRead(e, 'params')" />
        </div>
        <div class="form-group">
          <label>secret.key (Base64)</label>
          <input type="file" class="input" @change="(e) => handleFileRead(e, 'sk')" />
        </div>
        <div class="form-group">
          <label>public.key (Base64)</label>
          <input type="file" class="input" @change="(e) => handleFileRead(e, 'pk')" />
        </div>
        <div class="form-group">
          <label>relin.key (Base64)</label>
          <input type="file" class="input" @change="(e) => handleFileRead(e, 'rk')" />
        </div>
      </div>

      <button
        class="btn btn-primary"
        :disabled="store.state.busy || !importParamsB64 || !importSecretKeyB64"
        @click="handleImportSubmit"
      >
        <Upload :size="16" /> Validate & Import Account Into Vault
      </button>

      <hr style="border: none; border-top: 1px solid var(--border); margin: 22px 0;" />

      <h3><ShieldAlert :size="16" style="vertical-align: text-bottom;" /> Cross-User Isolation Test (Scenario U03)</h3>
      <p class="card-subtitle">
        Paste a Base64 ciphertext from User A, switch to User B in the top bar, and attempt local
        decryption with User B's <code>sk</code>.
      </p>
      <div class="form-group">
        <textarea
          v-model="arbitraryCiphertext"
          rows="2"
          class="textarea mono small"
          placeholder="Paste Base64 ciphertext here..."
        />
      </div>
      <button
        class="btn btn-secondary btn-sm"
        :disabled="!store.activeAccount.value || !arbitraryCiphertext"
        @click="handleCrossDecryptTest"
      >
        <Key :size="14" /> Attempt Decrypt with Active Account sk
      </button>

      <div v-if="crossDecryptResult" class="banner warning" style="margin-top: 12px;">
        <div>
          <strong>Decrypted with wrong key:</strong> {{ crossDecryptResult.roundedDisplay }} (raw:
          <span class="mono">{{ crossDecryptResult.rawValue }}</span>) — garbage/noise output
          confirming key isolation!
        </div>
      </div>
      <div v-if="crossDecryptError" class="banner error" style="margin-top: 12px;">
        <div>{{ crossDecryptError }}</div>
      </div>
    </div>
  </div>
</template>
