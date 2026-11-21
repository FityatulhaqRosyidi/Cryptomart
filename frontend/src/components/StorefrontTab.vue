<script setup lang="ts">
import { computed, ref } from 'vue'
import { ShoppingCart, ShieldCheck, AlertTriangle, Calculator } from 'lucide-vue-next'
import { useCryptomartStore } from '../composables/useCryptomartStore'
import { formatCurrency } from '../services/ckksService'

const store = useCryptomartStore()

const selectedProductId = ref(store.state.products[0]?.product_id ?? 'CAKE-STRW')
const quantity = ref<number>(2)
const selectedDiscountCode = ref<string>('REF10_500')

const lastTxResult = ref<Awaited<ReturnType<typeof store.executeTransaction>>>(null)

const selectedProduct = computed(() =>
  store.state.products.find((p) => p.product_id === selectedProductId.value) ??
  store.state.products[0]
)

const selectedDiscount = computed(() =>
  store.state.discounts.find((d) => d.discount_code === selectedDiscountCode.value) ??
  store.state.discounts[0]
)

const referenceBill = computed(() => {
  if (!selectedProduct.value || !selectedDiscount.value) return 0
  return (
    selectedProduct.value.unit_price *
      quantity.value *
      (1 - selectedDiscount.value.percentage_discount) -
    selectedDiscount.value.fixed_cut
  )
})

async function handleCheckout() {
  if (!selectedProduct.value || !selectedDiscount.value) return
  const res = await store.executeTransaction(
    selectedProduct.value.product_id,
    quantity.value,
    selectedDiscount.value.discount_code
  )
  if (res) {
    lastTxResult.value = res
  }
}
</script>

<template>
  <div class="grid-2">
    <div class="card">
      <h2>Catalog & Encrypted Checkout (Transact)</h2>
      <p class="card-subtitle">
        Quantity <code>q</code> and metadata vector <code>[prod_id, q, disc_id]</code> are
        encrypted client-side with CKKS before calling <code>POST /api/transact</code>.
      </p>

      <div class="form-group">
        <label>Select Product (Catalog Source: {{ store.state.catalogSource }})</label>
        <div style="display: grid; gap: 10px;">
          <div
            v-for="prod in store.state.products"
            :key="prod.product_id"
            class="product-card"
            :class="{ selected: prod.product_id === selectedProductId }"
            @click="selectedProductId = prod.product_id"
          >
            <div class="row-between">
              <div>
                <strong>{{ prod.name }}</strong>
                <span class="pill accent" style="margin-left: 8px;">
                  {{ prod.product_id }} (#{{ prod.numeric_id }})
                </span>
              </div>
              <strong class="mono">{{ formatCurrency(prod.unit_price) }}</strong>
            </div>
            <div class="muted small" style="margin-top: 4px;">
              {{ prod.description }}
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="tx-qty">Quantity (q)</label>
          <input
            id="tx-qty"
            v-model.number="quantity"
            type="number"
            step="any"
            min="0.01"
            class="input mono"
          />
        </div>

        <div class="form-group">
          <label for="tx-discount">Discount Rule</label>
          <select id="tx-discount" v-model="selectedDiscountCode" class="select">
            <option
              v-for="disc in store.state.discounts"
              :key="disc.discount_code"
              :value="disc.discount_code"
            >
              {{ disc.discount_code }} (#{{ disc.numeric_id }}) — {{ disc.label }}
            </option>
          </select>
        </div>
      </div>

      <div
        class="card"
        style="background: var(--bg-input); padding: 14px; margin-bottom: 16px;"
      >
        <div class="row-gap" style="margin-bottom: 6px;">
          <Calculator :size="16" />
          <strong>Client-Side Reference Calculation (Validation Only)</strong>
        </div>
        <div class="small muted">
          Formula: <code>t = (p × q × (1 - d)) - k</code>
        </div>
        <div class="mono small" style="margin-top: 6px;">
          ({{ selectedProduct?.unit_price }} × {{ quantity }} × (1 -
          {{ selectedDiscount?.percentage_discount }})) - {{ selectedDiscount?.fixed_cut }} =
          <strong>{{ formatCurrency(referenceBill) }}</strong>
          <span class="muted"> (raw: {{ referenceBill }})</span>
        </div>
      </div>

      <button
        class="btn btn-primary"
        style="width: 100%;"
        :disabled="store.state.busy || !store.activeAccount.value"
        @click="handleCheckout"
      >
        <ShoppingCart :size="17" />
        {{
          store.activeAccount.value
            ? 'Encrypt Quantity & Metadata → Checkout (POST /api/transact)'
            : 'Activate or Import an Account First'
        }}
      </button>
    </div>

    <div class="card">
      <h2>Last Encrypted Transaction Output</h2>
      <p class="card-subtitle">
        Server evaluates two ciphertext×ciphertext multiplications (<code>relinearize</code> +
        <code>rescale</code>) without knowing <code>q</code> or <code>sk</code>.
      </p>

      <div
        v-if="store.isNegativeBalance.value"
        class="banner warning"
        style="margin-bottom: 16px;"
      >
        <div class="row-gap">
          <AlertTriangle :size="18" />
          <span>
            <strong>Negative Balance Warning:</strong> Decrypted balance is below zero (overdraft
            permitted by spec U06; client detected negative balance after decryption).
          </span>
        </div>
      </div>

      <div v-if="lastTxResult" style="display: grid; gap: 14px;">
        <div class="row-between">
          <span class="muted small">Transaction ID</span>
          <span class="pill accent mono">{{ lastTxResult.transaction_id }}</span>
        </div>

        <div>
          <div class="cipher-box-label">Sent Encrypted Inputs (Client → Server)</div>
          <div class="cipher-snippet">
            <div><strong>quantity_ct_b64:</strong> {{ lastTxResult.quantityCtPreview }}</div>
            <div><strong>metadata_ct_b64:</strong> {{ lastTxResult.metadataCtPreview }}</div>
          </div>
        </div>

        <div class="cipher-pair">
          <div>
            <div class="cipher-box-label">Bill Ciphertext (Base64 Preview)</div>
            <div class="cipher-snippet">{{ lastTxResult.decBill.ciphertextPreview }}</div>
            <div class="muted small" style="margin-top: 6px;">
              {{ lastTxResult.decBill.ciphertextBinaryBytes }} B bin /
              {{ lastTxResult.decBill.ciphertextBase64Bytes }} B Base64
            </div>
          </div>
          <div>
            <div class="cipher-box-label">Decrypted Bill (Client sk)</div>
            <div style="font-size: 1.25rem; font-weight: 700;">
              {{ lastTxResult.decBill.roundedDisplay }}
            </div>
            <div class="mono small muted">
              Raw float: {{ lastTxResult.decBill.rawValue.toFixed(8) }}
            </div>
            <div class="mono small muted">
              e_abs: {{ lastTxResult.billAbsError.toExponential(3) }}
              <span v-if="lastTxResult.billRelError !== null">
                | e_rel: {{ lastTxResult.billRelError.toExponential(3) }}
              </span>
            </div>
          </div>
        </div>

        <div class="cipher-pair">
          <div>
            <div class="cipher-box-label">Updated Balance Ciphertext (Base64)</div>
            <div class="cipher-snippet">{{ lastTxResult.decBalance.ciphertextPreview }}</div>
            <div class="muted small" style="margin-top: 6px;">
              {{ lastTxResult.decBalance.ciphertextBinaryBytes }} B bin /
              {{ lastTxResult.decBalance.ciphertextBase64Bytes }} B Base64
            </div>
          </div>
          <div>
            <div class="cipher-box-label">Decrypted Balance (Client sk)</div>
            <div
              style="font-size: 1.25rem; font-weight: 700;"
              :style="{
                color: lastTxResult.decBalance.rawValue < -0.0001 ? 'var(--danger)' : 'var(--success)',
              }"
            >
              {{ lastTxResult.decBalance.roundedDisplay }}
            </div>
            <div class="mono small muted">
              Raw float: {{ lastTxResult.decBalance.rawValue.toFixed(8) }}
            </div>
          </div>
        </div>
      </div>

      <div v-else class="muted small" style="padding: 24px 0; text-align: center;">
        <ShieldCheck :size="32" style="opacity: 0.45; margin-bottom: 8px;" />
        <div>No checkout run in this session yet. Select a product and run a transaction.</div>
      </div>
    </div>
  </div>
</template>
