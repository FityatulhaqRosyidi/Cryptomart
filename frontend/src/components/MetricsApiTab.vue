<script setup lang="ts">
import { ref } from 'vue'
import { Activity, Download, Terminal } from 'lucide-vue-next'
import { useCryptomartStore } from '../composables/useCryptomartStore'

const store = useCryptomartStore()
const selectedLogId = ref<string | null>(null)

function sanitizeForPreview(obj: unknown): unknown {
  if (typeof obj === 'string' && obj.length > 96) {
    return `${obj.slice(0, 40)}...(${obj.length} chars)...${obj.slice(-16)}`
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForPreview)
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeForPreview(v)
    }
    return out
  }
  return obj
}

function exportMetricsJson() {
  const blob = new Blob([JSON.stringify(store.state.metrics, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cryptomart_metrics_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div style="display: grid; gap: 20px;">
    <div class="card">
      <div class="row-between" style="margin-bottom: 12px;">
        <div>
          <h2 style="margin-bottom: 4px;"><Activity :size="18" style="vertical-align: text-bottom;" /> Performance & Numerical Error Log</h2>
          <p class="card-subtitle" style="margin: 0;">
            Tracks monotonic client crypto timing, server evaluation timing, end-to-end latency,
            and unrounded CKKS approximation error.
          </p>
        </div>
        <button
          class="btn btn-secondary btn-sm"
          :disabled="store.state.metrics.length === 0"
          @click="exportMetricsJson"
        >
          <Download :size="14" /> Export Metrics JSON
        </button>
      </div>

      <div v-if="store.state.metrics.length === 0" class="muted small">
        No operations measured yet.
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Op</th>
              <th>Profile</th>
              <th>Client Crypto</th>
              <th>Server Eval</th>
              <th>End-to-End</th>
              <th>Ciphertext Size</th>
              <th>Ref vs Decrypted (e_abs / e_rel)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in store.state.metrics" :key="m.id">
              <td class="mono"><strong>{{ m.operation }}</strong></td>
              <td class="mono small">{{ m.profileId }}</td>
              <td class="mono">{{ m.clientCryptoMs.toFixed(2) }} ms</td>
              <td class="mono">
                {{ m.serverEvalMs !== undefined ? m.serverEvalMs.toFixed(2) + ' ms' : '—' }}
              </td>
              <td class="mono"><strong>{{ m.endToEndMs.toFixed(2) }} ms</strong></td>
              <td class="mono small">
                <template v-if="m.ciphertextBinaryBytes">
                  {{ m.ciphertextBinaryBytes }} B / {{ m.ciphertextBase64Bytes }} B b64
                </template>
                <template v-else>—</template>
              </td>
              <td class="mono small">
                <template v-if="m.referenceValue !== undefined && m.decryptedRawValue !== undefined">
                  y={{ m.referenceValue }}, ŷ={{ m.decryptedRawValue.toFixed(6) }}
                  <div class="muted">
                    e_abs={{ m.absError?.toExponential(3) }} | e_rel={{
                      m.relError !== null && m.relError !== undefined
                        ? m.relError.toExponential(3)
                        : 'undef (y=0)'
                    }}
                  </div>
                </template>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2><Terminal :size="18" style="vertical-align: text-bottom;" /> REST API Call Inspector</h2>
      <p class="card-subtitle">
        Inspect exact HTTP requests and JSON payloads sent by the Vue frontend (large Base64
        fields truncated in preview).
      </p>

      <div v-if="store.state.apiLogs.length === 0" class="muted small">
        No API calls recorded yet.
      </div>

      <div v-else style="display: grid; gap: 10px;">
        <div
          v-for="log in store.state.apiLogs"
          :key="log.id"
          style="border: 1px solid var(--border); border-radius: 10px; padding: 12px; background: var(--bg-input);"
        >
          <div
            class="row-between"
            style="cursor: pointer;"
            @click="selectedLogId = selectedLogId === log.id ? null : log.id"
          >
            <div class="row-gap">
              <span class="pill accent mono">{{ log.method }}</span>
              <strong>{{ log.serviceName }}</strong>
              <span class="mono small muted">{{ log.url }}</span>
            </div>
            <div class="row-gap">
              <span class="pill" :class="log.status >= 200 && log.status < 300 ? 'success' : 'danger'">
                HTTP {{ log.status }}
              </span>
              <span class="mono small muted">{{ log.durationMs.toFixed(1) }} ms</span>
            </div>
          </div>

          <div v-if="selectedLogId === log.id" style="margin-top: 12px;" class="grid-2">
            <div>
              <div class="cipher-box-label">Request JSON</div>
              <pre class="json-view">{{
                log.requestBody ? JSON.stringify(sanitizeForPreview(log.requestBody), null, 2) : '(no body)'
              }}</pre>
            </div>
            <div>
              <div class="cipher-box-label">Response JSON</div>
              <pre class="json-view">{{
                log.error
                  ? log.error
                  : JSON.stringify(sanitizeForPreview(log.responseBody), null, 2)
              }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
