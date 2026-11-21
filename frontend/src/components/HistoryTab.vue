<script setup lang="ts">
import { RefreshCw, History } from 'lucide-vue-next'
import { useCryptomartStore } from '../composables/useCryptomartStore'

const store = useCryptomartStore()
</script>

<template>
  <div class="card">
    <div class="row-between" style="margin-bottom: 12px;">
      <div>
        <h2 style="margin-bottom: 4px;">Encrypted Transaction History (GetTransact)</h2>
        <p class="card-subtitle" style="margin: 0;">
          Fetches encrypted metadata <code>[prod_id, qty, disc_id]</code> and encrypted bills via
          <code>GET /api/transactions/:userId</code>, then decrypts and recovers IDs locally.
        </p>
      </div>
      <button
        class="btn btn-primary"
        :disabled="store.state.busy || !store.activeAccount.value"
        @click="store.fetchTransactions"
      >
        <RefreshCw :size="16" />
        Fetch & Decrypt History
      </button>
    </div>

    <div v-if="store.state.transactions.length === 0" class="muted small" style="padding: 28px 0; text-align: center;">
      <History :size="30" style="opacity: 0.45; margin-bottom: 8px;" />
      <div>No decrypted transactions loaded. Click "Fetch & Decrypt History" above.</div>
    </div>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction ID & Time</th>
            <th>Metadata Ciphertext (Base64)</th>
            <th>Decrypted Metadata Vector</th>
            <th>Bill Ciphertext (Base64)</th>
            <th>Decrypted Bill</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in store.state.transactions" :key="tx.transaction_id">
            <td>
              <div class="mono small"><strong>{{ tx.transaction_id }}</strong></div>
              <div class="muted small">{{ new Date(tx.timestamp).toLocaleString() }}</div>
            </td>
            <td>
              <div class="cipher-snippet">{{ tx.metadata_preview }}</div>
            </td>
            <td>
              <div>
                <strong>{{ tx.decrypted_metadata.productName }}</strong>
                <span class="muted small"> ({{ tx.decrypted_metadata.productId }})</span>
              </div>
              <div class="small">
                Qty: <strong class="mono">{{ tx.decrypted_metadata.quantityRounded }}</strong> |
                Discount: <span class="mono">{{ tx.decrypted_metadata.discountCode }}</span>
              </div>
              <div class="mono small muted">
                Raw vec: [{{ tx.decrypted_metadata.productNumericIdRaw.toFixed(4) }},
                {{ tx.decrypted_metadata.quantityRaw.toFixed(4) }},
                {{ tx.decrypted_metadata.discountNumericIdRaw.toFixed(4) }}]
              </div>
              <span
                class="pill"
                :class="tx.decrypted_metadata.withinTolerance ? 'success' : 'danger'"
                style="margin-top: 4px;"
              >
                ID err: {{ tx.decrypted_metadata.maxIdRoundingError.toExponential(2) }}
              </span>
            </td>
            <td>
              <div class="cipher-snippet">{{ tx.bill_preview }}</div>
            </td>
            <td>
              <div style="font-weight: 700;">{{ tx.decrypted_bill.roundedDisplay }}</div>
              <div class="mono small muted">
                Raw: {{ tx.decrypted_bill.rawValue.toFixed(8) }}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
