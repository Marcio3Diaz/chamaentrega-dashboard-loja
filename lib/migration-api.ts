export type MigrationApiHealth = {
  configured: boolean
  ok: boolean
  status: string
  mysql?: string
  timestamp?: string
}

function apiConfig() {
  const baseUrl = process.env.CHAMA_MIGRATION_API_URL?.trim().replace(/\/$/, '')
  const key = process.env.CHAMA_MIGRATION_API_KEY?.trim()
  return { baseUrl, key }
}

export function isMigrationApiConfigured() {
  const { baseUrl, key } = apiConfig()
  return Boolean(baseUrl && key)
}

export async function checkMigrationApiHealth(): Promise<MigrationApiHealth> {
  const { baseUrl } = apiConfig()
  if (!baseUrl) return { configured: false, ok: false, status: 'not_configured' }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    return {
      configured: true,
      ok: response.ok && body.status === 'ok',
      status: String(body.status ?? (response.ok ? 'ok' : 'error')),
      mysql: typeof body.mysql === 'string' ? body.mysql : undefined,
      timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
    }
  } catch {
    return { configured: true, ok: false, status: 'unreachable' }
  }
}

export async function createMigrationDelivery(
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) throw new Error('migration_api_not_configured')

  const response = await fetch(`${baseUrl}/v1/internal/deliveries`, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Chama-Internal-Key': key,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(String(body.error ?? 'migration_api_error'))
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }
  return body
}
