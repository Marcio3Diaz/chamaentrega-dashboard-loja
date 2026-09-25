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


export function isMigrationShadowWriteEnabled() {
  const raw = process.env.CHAMA_MYSQL_SHADOW_WRITE?.trim().toLowerCase()
  return ['1','true','yes','on'].includes(raw ?? '') && isMigrationApiConfigured()
}

export type MigrationShadowWriteResult = {
  attempted:boolean
  ok:boolean
  response?:Record<string,unknown>
  error?:string
}

export async function shadowPublishedDeliveryToMySql(
  payload:Record<string,unknown>,
  idempotencyKey:string,
):Promise<MigrationShadowWriteResult> {
  if (!isMigrationShadowWriteEnabled()) {
    return { attempted:false, ok:true }
  }

  try {
    const response = await createMigrationDelivery(payload,idempotencyKey)
    return {
      attempted:true,
      ok:true,
      response: response as Record<string,unknown>,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_shadow_write_error'
    console.error('[mysql-shadow] delivery write failed', {
      deliveryId: payload.deliveryId ?? null,
      storeId: payload.storeId ?? null,
      error: message,
    })
    return {
      attempted:true,
      ok:false,
      error:message,
    }
  }
}
