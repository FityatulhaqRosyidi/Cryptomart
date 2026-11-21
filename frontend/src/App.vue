<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  Shield,
  ShoppingBag,
  Wallet,
  History,
  KeyRound,
  Layers,
  Activity,
  Server,
  X,
} from 'lucide-vue-next'
import { useCryptomartStore } from './composables/useCryptomartStore'
import StorefrontTab from './components/StorefrontTab.vue'
import WalletTab from './components/WalletTab.vue'
import HistoryTab from './components/HistoryTab.vue'
import KeyVaultTab from './components/KeyVaultTab.vue'
import SimdBatchTab from './components/SimdBatchTab.vue'
import MetricsApiTab from './components/MetricsApiTab.vue'

type TabId = 'store' | 'wallet' | 'history' | 'vault' | 'simd' | 'metrics'

const store = useCryptomartStore()
const activeTab = ref<TabId>('wallet')
const apiBaseInput = ref(store.state.apiBaseUrl)

onMounted(() => {
  store.refreshCatalog()
})

function handleAccountChange(event: Event) {
  const val = (event.target as HTMLSelectElement).value
  store.updateSettings({ activeUserId: val })
}

function applyApiUrl() {
  store.updateSettings({ apiBaseUrl: apiBaseInput.value.trim() })
  store.refreshCatalog()
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-icon">
          <Shield :size="20" />
        </div>
        <div>
          <h1>Cryptomart — CKKS FHE Online Store</h1>
          <p>Client-side SEAL WASM Encryption • Secret Key Never Leaves Browser</p>
        </div>
      </div>

      <div class="topbar-controls">
        <div class="row-gap">
          <label class="small muted" for="active-account-select">Account:</label>
          <select
            id="active-account-select"
            class="select"
            style="width: auto; min-width: 140px; padding: 6px 10px;"
            :value="store.state.activeUserId"
            @change="handleAccountChange"
          >
            <option value="" disabled>-- None --</option>
            <option
              v-for="acct in store.accountList.value"
              :key="acct.user_id"
              :value="acct.user_id"
            >
              {{ acct.user_id }} ({{ acct.profile_id === 'standard_8192' ? 'N=8192' : 'N=16384' }})
            </option>
          </select>
        </div>

        <div class="row-gap">
          <Server :size="15" class="muted" />
          <input
            v-model="apiBaseInput"
            type="text"
            class="input mono small"
            style="width: 225px; padding: 6px 8px;"
            @keyup.enter="applyApiUrl"
          />
          <button class="btn btn-secondary btn-sm" @click="applyApiUrl">
            Set Backend API
          </button>
        </div>

        <span class="pill accent">Eval: Backend REST API</span>
        <span class="pill success">sk: Local Only</span>
      </div>
    </header>

    <nav class="nav-tabs">
      <button
        class="nav-tab"
        :class="{ active: activeTab === 'wallet' }"
        @click="activeTab = 'wallet'"
      >
        <Wallet :size="16" /> Wallet & Activate
      </button>
      <button
        class="nav-tab"
        :class="{ active: activeTab === 'store' }"
        @click="activeTab = 'store'"
      >
        <ShoppingBag :size="16" /> Storefront (Transact)
      </button>
      <button
        class="nav-tab"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        <History :size="16" /> History (GetTransact)
      </button>
      <button
        class="nav-tab"
        :class="{ active: activeTab === 'vault' }"
        @click="activeTab = 'vault'"
      >
        <KeyRound :size="16" /> Key Vault (Export/Import)
      </button>
      <button
        class="nav-tab"
        :class="{ active: activeTab === 'simd' }"
        @click="activeTab = 'simd'"
      >
        <Layers :size="16" /> SIMD Batch (Bonus)
      </button>
      <button
        class="nav-tab"
        :class="{ active: activeTab === 'metrics' }"
        @click="activeTab = 'metrics'"
      >
        <Activity :size="16" /> Metrics & API Inspector
      </button>
    </nav>

    <main class="main-container">
      <div
        v-if="store.state.statusBanner"
        class="banner"
        :class="store.state.statusBanner.type"
      >
        <span>{{ store.state.statusBanner.message }}</span>
        <button
          class="btn btn-sm"
          style="background: transparent; color: inherit; padding: 2px 6px;"
          @click="store.state.statusBanner = null"
        >
          <X :size="15" />
        </button>
      </div>

      <WalletTab v-if="activeTab === 'wallet'" />
      <StorefrontTab v-else-if="activeTab === 'store'" />
      <HistoryTab v-else-if="activeTab === 'history'" />
      <KeyVaultTab v-else-if="activeTab === 'vault'" />
      <SimdBatchTab v-else-if="activeTab === 'simd'" />
      <MetricsApiTab v-else-if="activeTab === 'metrics'" />
    </main>
  </div>
</template>
