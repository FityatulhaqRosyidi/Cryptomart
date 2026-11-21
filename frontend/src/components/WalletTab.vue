<script setup lang="ts">
import { ref } from 'vue'
import { Wallet, KeyRound, PlusCircle, RefreshCw, AlertTriangle } from 'lucide-vue-next'
import type { CkksProfileId } from '../types/cryptomart'
import { CKKS_PROFILES, DEFAULT_CKKS_PROFILE_ID } from '../config/ckksProfiles'
import { useCryptomartStore } from '../composables/useCryptomartStore'

const store = useCryptomartStore()

const newUserId = ref('alice')
const selectedProfileId = ref<CkksProfileId>(DEFAULT_CKKS_PROFILE_ID)
const topupAmount = ref<number>(100000)

async function handleActivate() {
  await store.createAndActivateAccount(newUserId.value, selectedProfileId.value)
}

async function handleTopup() {
  await store.topup(topupAmount.value)
}
</script>

<template>
  <div class="grid-2">
    <div class="card">
      <h2>1. Activate Account (Activate)</h2>
      <p class="card-subtitle">
        Generates <code>sk</code>, <code>pk</code>, <code>rk</code>, and CKKS parameters in browser
        WASM, encrypts initial balance <code>0.0</code>, and sends only public artifacts to
        <code>POST /api/activate</code>.
      </p>

      <div class="form-group">
        <label for="act-uid">User ID</label>
        <input
          id="act-uid"
          v-model="newUserId"
          type="text"
          class="input"
          placeholder="e.g., alice or bob"
        />
      </div>

      <div class="form-group">
        <label for="act-profile">CKKS Parameter Profile</label>
        <select id="act-profile" v-model="selectedProfileId" class="select">
          <option v-for="prof in Object.values(CKKS_PROFILES)" :key="prof.id" :value="prof.id">
            {{ prof.name }}
          </option>
        </select>
        <div class="muted small" style="margin-top: 6px;">
          {{ CKKS_PROFILES[selectedProfileId].description }}
          <div class="mono" style="margin-top: 4px;">
            N={{ CKKS_PROFILES[selectedProfileId].polyModulusDegree }}, ModChain=[{{
              CKKS_PROFILES[selectedProfileId].coeffModulusBitSizes.join(', ')
            }}], Δ=2^{{ CKKS_PROFILES[selectedProfileId].scaleBits }}, Security={{
              CKKS_PROFILES[selectedProfileId].securityLevel
            }}
          </div>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="store.state.busy" @click="handleActivate">
        <KeyRound :size="16" />
        Generate Keys Locally & Activate Account
      </button>
    </div>

    <div class="card">
      <h2>2. Wallet Balance & Top-Up (CheckBalance / Topup)</h2>
      <p class="card-subtitle">
        Encrypted balance is fetched from <code>GET /api/balance/:userId</code> and decrypted
        locally. Top-up supports integers and decimals via <code>POST /api/topup</code>.
      </p>

      <div v-if="!store.activeAccount.value" class="muted small" style="padding: 16px 0;">
        No active account selected. Activate a new account on the left or import keys in the Key
        Vault tab.
      </div>

      <template v-else>
        <div
          v-if="store.isNegativeBalance.value"
          class="banner warning"
          style="margin-bottom: 14px;"
        >
          <div class="row-gap">
            <AlertTriangle :size="18" />
            <span>
              <strong>Negative Balance:</strong> Decrypted balance is negative! Top up to restore
              positive balance.
            </span>
          </div>
        </div>

        <div class="row-between" style="margin-bottom: 12px;">
          <div class="row-gap">
            <Wallet :size="18" />
            <strong>Active User:</strong>
            <span class="pill accent mono">{{ store.activeAccount.value.user_id }}</span>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            :disabled="store.state.busy"
            @click="store.checkBalance"
          >
            <RefreshCw :size="14" />
            CheckBalance
          </button>
        </div>

        <div v-if="store.state.latestBalanceResult" class="cipher-pair" style="margin-bottom: 16px;">
          <div>
            <div class="cipher-box-label">Encrypted Balance (Base64 Preview)</div>
            <div class="cipher-snippet">
              {{ store.state.latestBalanceResult.ciphertextPreview }}
            </div>
            <div class="muted small" style="margin-top: 6px;">
              {{ store.state.latestBalanceResult.ciphertextBinaryBytes }} B bin /
              {{ store.state.latestBalanceResult.ciphertextBase64Bytes }} B Base64
            </div>
          </div>
          <div>
            <div class="cipher-box-label">Decrypted Balance (Unrounded & Display)</div>
            <div
              style="font-size: 1.35rem; font-weight: 700;"
              :style="{
                color: store.isNegativeBalance.value ? 'var(--danger)' : 'var(--success)',
              }"
            >
              {{ store.state.latestBalanceResult.roundedDisplay }}
            </div>
            <div class="mono small muted">
              Raw float: {{ store.state.latestBalanceResult.rawValue.toFixed(10) }}
            </div>
            <div
              v-if="store.activeAccount.value.reference_balance !== undefined"
              class="mono small muted"
            >
              Client Ref: {{ store.activeAccount.value.reference_balance }} (|y - ŷ| =
              {{
                Math.abs(
                  store.activeAccount.value.reference_balance -
                    store.state.latestBalanceResult.rawValue
                ).toExponential(3)
              }})
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="topup-amt">Top-Up Nominal (supports decimals, e.g., 12500.75)</label>
          <div class="row-gap">
            <input
              id="topup-amt"
              v-model.number="topupAmount"
              type="number"
              step="any"
              min="0.01"
              class="input mono"
              style="flex: 1;"
            />
            <button
              class="btn btn-primary"
              :disabled="store.state.busy"
              @click="handleTopup"
            >
              <PlusCircle :size="16" />
              Encrypt & Topup
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
