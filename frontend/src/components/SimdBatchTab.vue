<script setup lang="ts">
import { ref } from 'vue'
import { Layers, Plus, Trash2, Play } from 'lucide-vue-next'
import { useCryptomartStore } from '../composables/useCryptomartStore'
import { formatCurrency } from '../services/ckksService'

const store = useCryptomartStore()

const batchRows = ref([
  { product_id: 'CAKE-STRW', quantity: 2, discount_code: 'REF10_500' },
  { product_id: 'CAKE-CHOC', quantity: 1, discount_code: 'NONE' },
  { product_id: 'CAKE-MTC', quantity: 3, discount_code: 'PERCENT15' },
  { product_id: 'COFF-ESP', quantity: 2, discount_code: 'FLAT2500' },
  { product_id: 'TEA-EARL', quantity: 4, discount_code: 'VIP20_1000' },
  { product_id: 'CAKE-STRW', quantity: 5, discount_code: 'PERCENT15' },
  { product_id: 'CAKE-CHOC', quantity: 2, discount_code: 'REF10_500' },
  { product_id: 'TEA-EARL', quantity: 1, discount_code: 'NONE' },
])

const batchResult = ref<Awaited<ReturnType<typeof store.runSimdBatch>>>(null)

function addRow() {
  batchRows.value.push({
    product_id: store.state.products[0]?.product_id || 'CAKE-STRW',
    quantity: 1,
    discount_code: 'NONE',
  })
}

function removeRow(idx: number) {
  if (batchRows.value.length > 1) {
    batchRows.value.splice(idx, 1)
  }
}

async function handleRunBatch() {
  const res = await store.runSimdBatch(batchRows.value)
  if (res) {
    batchResult.value = res
  }
}
</script>

<template>
  <div class="grid-2">
    <div class="card">
      <h2>Bonus: SIMD Batch Bill Evaluation</h2>
      <p class="card-subtitle">
        Packs <strong>{{ batchRows.length }}</strong> order quantities into a single CKKS ciphertext
        (max {{ store.activeProfile.value.slotCount }} slots, unused slots zero-padded) and
        evaluates all bills in parallel via <code>POST /api/batch-transact</code>.
      </p>

      <div style="display: grid; gap: 10px; margin-bottom: 14px;">
        <div
          v-for="(row, idx) in batchRows"
          :key="idx"
          style="display: grid; grid-template-columns: 36px 1fr 80px 1fr 34px; gap: 8px; align-items: center;"
        >
          <span class="pill accent mono">#{{ idx }}</span>
          <select v-model="row.product_id" class="select">
            <option v-for="p in store.state.products" :key="p.product_id" :value="p.product_id">
              {{ p.name }}
            </option>
          </select>
          <input v-model.number="row.quantity" type="number" step="any" min="0.1" class="input mono" />
          <select v-model="row.discount_code" class="select">
            <option v-for="d in store.state.discounts" :key="d.discount_code" :value="d.discount_code">
              {{ d.discount_code }}
            </option>
          </select>
          <button class="btn btn-danger btn-sm" @click="removeRow(idx)">
            <Trash2 :size="13" />
          </button>
        </div>
      </div>

      <div class="row-gap">
        <button class="btn btn-secondary" @click="addRow">
          <Plus :size="15" /> Add Slot Item
        </button>
        <button
          class="btn btn-primary"
          :disabled="store.state.busy || !store.activeAccount.value"
          @click="handleRunBatch"
        >
          <Play :size="15" /> Evaluate {{ batchRows.length }} Bills in 1 Ciphertext
        </button>
      </div>
    </div>

    <div class="card">
      <h2>SIMD Batch Results & Slot Comparison</h2>
      <p class="card-subtitle">
        Compares each decoded CKKS slot against exact client reference calculation (no balance
        mutation).
      </p>

      <div v-if="batchResult" style="display: grid; gap: 14px;">
        <div class="cipher-pair">
          <div>
            <div class="cipher-box-label">Single Result Ciphertext (Base64)</div>
            <div class="cipher-snippet">{{ batchResult.bills_ct_preview }}</div>
          </div>
          <div>
            <div class="cipher-box-label">Batch Timing & Size</div>
            <div class="small">
              End-to-End: <strong class="mono">{{ batchResult.endToEndMs.toFixed(2) }} ms</strong>
            </div>
            <div class="small">
              Client Crypto: <strong class="mono">{{ batchResult.clientCryptoMs.toFixed(2) }} ms</strong>
              <span v-if="batchResult.serverEvalMs !== undefined">
                | Server Eval: <strong class="mono">{{ batchResult.serverEvalMs.toFixed(2) }} ms</strong>
              </span>
            </div>
            <div class="small muted mono">
              {{ batchResult.ciphertextBinaryBytes }} B bin / {{ batchResult.ciphertextBase64Bytes }} B Base64
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Item & Disc</th>
                <th>Reference Bill</th>
                <th>Decrypted Bill (Raw)</th>
                <th>Abs Error</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in batchResult.slotResults" :key="s.slot">
                <td class="mono">#{{ s.slot }}</td>
                <td>
                  <div><strong>{{ s.product_name }}</strong> × {{ s.quantity }}</div>
                  <div class="muted small mono">{{ s.discount_code }}</div>
                </td>
                <td class="mono">{{ formatCurrency(s.reference_bill) }}</td>
                <td>
                  <div class="mono"><strong>{{ formatCurrency(s.decrypted_bill) }}</strong></div>
                  <div class="mono small muted">{{ s.decrypted_bill.toFixed(8) }}</div>
                </td>
                <td class="mono small">{{ s.abs_error.toExponential(3) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="muted small" style="padding: 28px 0; text-align: center;">
        <Layers :size="30" style="opacity: 0.45; margin-bottom: 8px;" />
        <div>Click "Evaluate Bills in 1 Ciphertext" to test SIMD slot packing.</div>
      </div>
    </div>
  </div>
</template>
