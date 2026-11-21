import type {
  ActivateRequest,
  ActivateResponse,
  ApiLogEntry,
  BatchTransactRequest,
  BatchTransactResponse,
  CatalogResponse,
  CheckBalanceResponse,
  GetTransactResponse,
  TopupRequest,
  TopupResponse,
  TransactRequest,
  TransactResponse,
} from '../types/cryptomart'

export interface ApiClientConfig {
  baseUrl: string
  onLog?: (entry: ApiLogEntry) => void
}

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

function buildLogId(): string {
  return `api-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

async function executeHttp<T>(
  config: ApiClientConfig,
  serviceName: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const cleanBase = config.baseUrl.replace(/\/+$/, '')
  const url = `${cleanBase}${path}`
  const t0 = performance.now()

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const durationMs = performance.now() - t0
    let parsed: unknown = null
    const text = await res.text()
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    config.onLog?.({
      id: buildLogId(),
      timestamp: new Date().toISOString(),
      serviceName,
      method,
      url,
      status: res.status,
      durationMs,
      requestBody: body,
      responseBody: parsed,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    })

    if (!res.ok) {
      const msg =
        typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `HTTP ${res.status} ${res.statusText}`
      throw new ApiError(res.status, msg, parsed)
    }

    return parsed as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    const durationMs = performance.now() - t0
    const message = (err as Error).message || 'Network request failed'
    config.onLog?.({
      id: buildLogId(),
      timestamp: new Date().toISOString(),
      serviceName,
      method,
      url,
      status: 0,
      durationMs,
      requestBody: body,
      error: message,
    })
    throw new ApiError(0, `Failed to reach backend at ${url}: ${message}`)
  }
}

export function createApiClient(getConfig: () => ApiClientConfig) {
  return {
    async fetchCatalog(): Promise<CatalogResponse> {
      return executeHttp<CatalogResponse>(getConfig(), 'GetCatalog', 'GET', '/catalog')
    },

    async activate(req: ActivateRequest): Promise<ActivateResponse> {
      return executeHttp<ActivateResponse>(getConfig(), 'Activate', 'POST', '/activate', req)
    },

    async checkBalance(userId: string): Promise<CheckBalanceResponse> {
      const path = `/balance/${encodeURIComponent(userId)}`
      return executeHttp<CheckBalanceResponse>(getConfig(), 'CheckBalance', 'GET', path)
    },

    async topup(req: TopupRequest): Promise<TopupResponse> {
      return executeHttp<TopupResponse>(getConfig(), 'Topup', 'POST', '/topup', req)
    },

    async transact(req: TransactRequest): Promise<TransactResponse> {
      return executeHttp<TransactResponse>(getConfig(), 'Transact', 'POST', '/transact', req)
    },

    async getTransactions(userId: string): Promise<GetTransactResponse> {
      const path = `/transactions/${encodeURIComponent(userId)}`
      return executeHttp<GetTransactResponse>(getConfig(), 'GetTransact', 'GET', path)
    },

    async batchTransact(req: BatchTransactRequest): Promise<BatchTransactResponse> {
      return executeHttp<BatchTransactResponse>(
        getConfig(),
        'BatchTransact',
        'POST',
        '/batch-transact',
        req
      )
    },
  }
}
