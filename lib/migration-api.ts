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


async function callMigrationDeliveryCommand(
  deliveryId:string,
  command:'accept'|'reject'|'status'|'cancel'|'location',
  payload:Record<string,unknown>,
) {
  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) throw new Error('migration_api_not_configured')

  const response = await fetch(
    `${baseUrl}/v1/internal/deliveries/${encodeURIComponent(deliveryId)}/${command}`,
    {
      method:'POST',
      cache:'no-store',
      signal:AbortSignal.timeout(8000),
      headers:{
        Accept:'application/json',
        'Content-Type':'application/json',
        'X-Chama-Internal-Key':key,
      },
      body:JSON.stringify(payload),
    },
  )

  const body = await response.json().catch(() => ({})) as Record<string,unknown>
  if (!response.ok) {
    const error = new Error(String(body.error ?? 'migration_api_error'))
    ;(error as Error & { status?:number }).status = response.status
    throw error
  }
  return body
}

export async function shadowCancelledDeliveryToMySql(
  deliveryId:string,
  storeId:string,
  reason?:string,
):Promise<MigrationShadowWriteResult> {
  if (!isMigrationShadowWriteEnabled()) {
    return { attempted:false, ok:true }
  }

  try {
    const response = await callMigrationDeliveryCommand(
      deliveryId,
      'cancel',
      { storeId, reason:reason ?? 'cancelled_in_supabase' },
    )
    return { attempted:true, ok:true, response }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_shadow_cancel_error'
    console.error('[mysql-shadow] delivery cancel failed', {
      deliveryId,
      storeId,
      error:message,
    })
    return { attempted:true, ok:false, error:message }
  }
}


export async function shadowCourierNetworkReviewToMySql(
  storeId:string,
  courierId:string,
  reviewerId:string,
  decision:'connected'|'rejected',
  note?:string | null,
):Promise<MigrationShadowWriteResult> {
  if (!isMigrationShadowWriteEnabled()) {
    return { attempted:false, ok:true }
  }

  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) {
    return { attempted:false, ok:false, error:'migration_api_not_configured' }
  }

  try {
    const response = await fetch(`${baseUrl}/v1/internal/courier-network/review`, {
      method:'POST',
      cache:'no-store',
      signal:AbortSignal.timeout(8000),
      headers:{
        Accept:'application/json',
        'Content-Type':'application/json',
        'X-Chama-Internal-Key':key,
      },
      body:JSON.stringify({ storeId, courierId, reviewerId, decision, note:note ?? null }),
    })
    const body = await response.json().catch(() => ({})) as Record<string,unknown>
    if (!response.ok) throw new Error(String(body.error ?? 'migration_api_error'))
    return { attempted:true, ok:true, response:body }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_network_shadow_error'
    console.error('[mysql-shadow] courier network review failed', {
      storeId,
      courierId,
      reviewerId,
      decision,
      error:message,
    })
    return { attempted:true, ok:false, error:message }
  }
}


export async function createMigrationApiSession(input:{
  subjectId:string
  subjectRole:'store_owner'|'store_member'|'courier'|'admin'
  scopes?:string[]
  ttlSeconds?:number
}) {
  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) throw new Error('migration_api_not_configured')

  const response = await fetch(`${baseUrl}/v1/internal/auth/sessions`, {
    method:'POST',
    cache:'no-store',
    signal:AbortSignal.timeout(8000),
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      'X-Chama-Internal-Key':key,
    },
    body:JSON.stringify(input),
  })

  const body = await response.json().catch(() => ({})) as Record<string,unknown>
  if (!response.ok) {
    const error = new Error(String(body.error ?? 'migration_api_error'))
    ;(error as Error & { status?:number }).status = response.status
    throw error
  }
  return body
}

export function migrationRealtimeUrl() {
  const { baseUrl } = apiConfig()
  if (!baseUrl) return null
  return baseUrl.replace(/^http:/,'ws:').replace(/^https:/,'wss:') + '/realtime'
}
