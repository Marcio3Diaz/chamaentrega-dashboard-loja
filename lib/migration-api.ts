import type { Delivery } from '@/lib/types'

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


export function isMigrationReadEnabled() {
  const raw = process.env.CHAMA_MYSQL_READS?.trim().toLowerCase()
  return ['1','true','yes','on'].includes(raw ?? '') && isMigrationApiConfigured()
}

export function isMigrationReadCompareEnabled() {
  const raw = process.env.CHAMA_MYSQL_COMPARE_READS?.trim().toLowerCase()
  return ['1','true','yes','on'].includes(raw ?? '') && isMigrationApiConfigured()
}

type MigrationDeliveryWire = {
  id:string
  storeId:string
  assignedCourierId:string | null
  externalOrderId:string | null
  status:string
  pickupAddress:string
  pickupLatitude?:number | null
  pickupLongitude?:number | null
  deliveryAddress:string
  deliveryLatitude?:number | null
  deliveryLongitude?:number | null
  deliveryFee:number
  pickupDistanceKm:number | null
  deliveryDistanceKm:number | null
  estimatedMinutes:number | null
  paymentMethod:string
  orderTotal:number | null
  customerName:string | null
  customerPhone:string | null
  customerNote:string | null
  itemCount:number
  packageWeightKg:number | null
  readyAt:string | null
  acceptedAt:string | null
  completedAt:string | null
  createdAt:string
  updatedAt:string
}

export type MigrationStoreDeliveriesResult = {
  storeId:string
  count:number
  deliveries:Delivery[]
}

function migrationDeliveryToApp(row:MigrationDeliveryWire):Delivery {
  return {
    id:row.id,
    store_id:row.storeId,
    assigned_courier_id:row.assignedCourierId,
    external_order_id:row.externalOrderId,
    status:row.status,
    pickup_address:row.pickupAddress,
    pickup_latitude:row.pickupLatitude == null ? null : Number(row.pickupLatitude),
    pickup_longitude:row.pickupLongitude == null ? null : Number(row.pickupLongitude),
    delivery_address:row.deliveryAddress,
    delivery_latitude:row.deliveryLatitude == null ? null : Number(row.deliveryLatitude),
    delivery_longitude:row.deliveryLongitude == null ? null : Number(row.deliveryLongitude),
    delivery_fee:Number(row.deliveryFee ?? 0),
    pickup_distance_km:row.pickupDistanceKm == null ? null : Number(row.pickupDistanceKm),
    delivery_distance_km:row.deliveryDistanceKm == null ? null : Number(row.deliveryDistanceKm),
    estimated_minutes:row.estimatedMinutes == null ? null : Number(row.estimatedMinutes),
    payment_method:row.paymentMethod,
    order_total:row.orderTotal == null ? null : Number(row.orderTotal),
    customer_name:row.customerName,
    customer_phone:row.customerPhone,
    customer_note:row.customerNote,
    item_count:Number(row.itemCount ?? 1),
    package_weight_kg:row.packageWeightKg == null ? null : Number(row.packageWeightKg),
    created_at:row.createdAt,
    updated_at:row.updatedAt,
    ready_at:row.readyAt,
    accepted_at:row.acceptedAt,
    completed_at:row.completedAt,
  }
}

export async function listMigrationStoreDeliveries(
  storeId:string,
  options:{ limit?:number; since?:string } = {},
):Promise<MigrationStoreDeliveriesResult> {
  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) throw new Error('migration_api_not_configured')

  const query = new URLSearchParams()
  if (options.limit != null) query.set('limit', String(options.limit))
  if (options.since) query.set('since', options.since)

  const response = await fetch(
    `${baseUrl}/v1/internal/stores/${encodeURIComponent(storeId)}/deliveries${query.size ? `?${query.toString()}` : ''}`,
    {
      cache:'no-store',
      signal:AbortSignal.timeout(5000),
      headers:{
        Accept:'application/json',
        'X-Chama-Internal-Key':key,
      },
    },
  )

  const body = await response.json().catch(() => ({})) as {
    storeId?:string
    count?:number
    deliveries?:MigrationDeliveryWire[]
    error?:string
  }

  if (!response.ok) {
    const error = new Error(String(body.error ?? 'migration_api_error'))
    ;(error as Error & { status?:number }).status = response.status
    throw error
  }

  const rows = Array.isArray(body.deliveries) ? body.deliveries : []
  return {
    storeId:body.storeId ?? storeId,
    count:Number(body.count ?? rows.length),
    deliveries:rows.map(migrationDeliveryToApp),
  }
}

function deliveryParityDigest(rows:Delivery[]) {
  return rows
    .map(item => ({
      id:item.id,
      status:item.status,
      courier:item.assigned_courier_id ?? null,
      fee:Number(item.delivery_fee ?? 0).toFixed(2),
      updatedAt:item.updated_at,
    }))
    .sort((a,b) => a.id.localeCompare(b.id))
}

function logReadParity(
  storeId:string,
  label:string | null,
  mysqlRows:Delivery[],
  supabaseRows:Delivery[],
) {
  const mysql = deliveryParityDigest(mysqlRows)
  const supabase = deliveryParityDigest(supabaseRows)
  const mysqlById = new Map(mysql.map(item => [item.id,item]))
  const supabaseById = new Map(supabase.map(item => [item.id,item]))
  const onlyMysql = mysql.filter(item => !supabaseById.has(item.id)).map(item => item.id)
  const onlySupabase = supabase.filter(item => !mysqlById.has(item.id)).map(item => item.id)
  const mismatched = mysql
    .filter(item => {
      const source = supabaseById.get(item.id)
      return source && (
        source.status !== item.status
        || source.courier !== item.courier
        || source.fee !== item.fee
      )
    })
    .map(item => ({
      id:item.id,
      mysql:item,
      supabase:supabaseById.get(item.id),
    }))

  if (!onlyMysql.length && !onlySupabase.length && !mismatched.length) {
    console.info('[mysql-parity] deliveries match', {
      storeId,
      label,
      count:mysql.length,
    })
    return
  }

  console.warn('[mysql-parity] delivery divergence', {
    storeId,
    label,
    mysqlCount:mysql.length,
    supabaseCount:supabase.length,
    onlyMysql:onlyMysql.slice(0,20),
    onlySupabase:onlySupabase.slice(0,20),
    mismatched:mismatched.slice(0,20),
  })
}

export async function migrationStoreDeliveriesWithFallback(
  storeId:string,
  supabaseLoader:() => Promise<Delivery[]>,
  options:{ limit?:number; since?:string; label?:string } = {},
):Promise<{ deliveries:Delivery[]; source:'mysql'|'supabase' }> {
  const readEnabled = isMigrationReadEnabled()
  const compareEnabled = isMigrationReadCompareEnabled()
  const label = options.label ?? null

  if (!readEnabled && !compareEnabled) {
    return { deliveries:await supabaseLoader(), source:'supabase' }
  }

  if (!readEnabled && compareEnabled) {
    const supabaseRows = await supabaseLoader()

    try {
      const mysql = await listMigrationStoreDeliveries(storeId, options)
      logReadParity(storeId, label, mysql.deliveries, supabaseRows)
    } catch (error) {
      console.error('[mysql-parity] comparison failed', {
        storeId,
        label,
        error:error instanceof Error ? error.message : 'unknown_mysql_compare_error',
      })
    }

    return { deliveries:supabaseRows, source:'supabase' }
  }

  try {
    const mysql = await listMigrationStoreDeliveries(storeId, options)

    if (compareEnabled) {
      try {
        const supabaseRows = await supabaseLoader()
        logReadParity(storeId, label, mysql.deliveries, supabaseRows)
      } catch (error) {
        console.error('[mysql-parity] Supabase comparison failed', {
          storeId,
          label,
          error:error instanceof Error ? error.message : 'unknown_supabase_compare_error',
        })
      }
    }

    return { deliveries:mysql.deliveries, source:'mysql' }
  } catch (error) {
    console.error('[mysql-read] falling back to Supabase', {
      storeId,
      label,
      error:error instanceof Error ? error.message : 'unknown_mysql_read_error',
    })
    return { deliveries:await supabaseLoader(), source:'supabase' }
  }
}


export async function shadowDispatchRouteToMySql(
  storeId:string,
  courierId:string,
  deliveryIds:string[],
):Promise<MigrationShadowWriteResult> {
  if (!isMigrationShadowWriteEnabled()) {
    return { attempted:false, ok:true }
  }

  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) {
    return { attempted:false, ok:false, error:'migration_api_not_configured' }
  }

  try {
    const response = await fetch(`${baseUrl}/v1/internal/dispatch-route`, {
      method:'POST',
      cache:'no-store',
      signal:AbortSignal.timeout(8000),
      headers:{
        Accept:'application/json',
        'Content-Type':'application/json',
        'X-Chama-Internal-Key':key,
      },
      body:JSON.stringify({ storeId, courierId, deliveryIds }),
    })

    const body = await response.json().catch(() => ({})) as Record<string,unknown>
    if (!response.ok) {
      const error = new Error(String(body.error ?? 'migration_api_error'))
      ;(error as Error & { status?:number }).status = response.status
      throw error
    }

    return { attempted:true, ok:true, response:body }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_dispatch_shadow_error'
    console.error('[mysql-shadow] dispatch route failed', {
      storeId,
      courierId,
      deliveryIds,
      error:message,
    })
    return { attempted:true, ok:false, error:message }
  }
}


export type MigrationCourierActiveDelivery = {
  id:string
  status:string
  customerName:string | null
  deliveryAddress:string
  deliveryFee:number
  estimatedMinutes:number | null
  updatedAt:string
}

export type MigrationStoreCourier = {
  id:string
  fullName:string
  phone:string | null
  avatarUrl:string | null
  vehicleType:string | null
  isOnline:boolean
  isAvailable:boolean
  rating:number
  totalDeliveries:number
  currentLatitude:number | null
  currentLongitude:number | null
  lastLocationAt:string | null
  connectedAt:string | null
  activeDelivery:MigrationCourierActiveDelivery | null
}

export type MigrationStoreCourierRequest = {
  courierId:string
  fullName:string
  phone:string | null
  avatarUrl:string | null
  vehicleType:string | null
  rating:number
  totalDeliveries:number
  isOnline:boolean
  requestedAt:string
}

type MigrationCourierWire = {
  courierId:string
  fullName:string
  phone:string | null
  avatarUrl:string | null
  vehicleType:string | null
  isOnline:boolean
  isAvailable:boolean
  rating:number
  totalDeliveries:number
  currentLatitude:number | null
  currentLongitude:number | null
  lastLocationAt:string | null
  connectedAt?:string | null
  requestedAt?:string
  activeDelivery?:MigrationCourierActiveDelivery | null
}

export async function listMigrationStoreCouriers(storeId:string):Promise<{
  storeId:string
  connected:MigrationStoreCourier[]
  pending:MigrationStoreCourierRequest[]
}> {
  const { baseUrl, key } = apiConfig()
  if (!baseUrl || !key) throw new Error('migration_api_not_configured')

  const response = await fetch(
    `${baseUrl}/v1/internal/stores/${encodeURIComponent(storeId)}/couriers`,
    {
      cache:'no-store',
      signal:AbortSignal.timeout(5000),
      headers:{
        Accept:'application/json',
        'X-Chama-Internal-Key':key,
      },
    },
  )

  const body = await response.json().catch(() => ({})) as {
    storeId?:string
    connected?:MigrationCourierWire[]
    pending?:MigrationCourierWire[]
    error?:string
  }

  if (!response.ok) {
    const error = new Error(String(body.error ?? 'migration_api_error'))
    ;(error as Error & { status?:number }).status = response.status
    throw error
  }

  const connected = (Array.isArray(body.connected) ? body.connected : []).map(item => ({
    id:item.courierId,
    fullName:item.fullName,
    phone:item.phone ?? null,
    avatarUrl:item.avatarUrl ?? null,
    vehicleType:item.vehicleType ?? null,
    isOnline:Boolean(item.isOnline),
    isAvailable:Boolean(item.isAvailable),
    rating:Number(item.rating ?? 0),
    totalDeliveries:Number(item.totalDeliveries ?? 0),
    currentLatitude:item.currentLatitude == null ? null : Number(item.currentLatitude),
    currentLongitude:item.currentLongitude == null ? null : Number(item.currentLongitude),
    lastLocationAt:item.lastLocationAt ?? null,
    connectedAt:item.connectedAt ?? null,
    activeDelivery:item.activeDelivery ?? null,
  }))

  const pending = (Array.isArray(body.pending) ? body.pending : []).map(item => ({
    courierId:item.courierId,
    fullName:item.fullName,
    phone:item.phone ?? null,
    avatarUrl:item.avatarUrl ?? null,
    vehicleType:item.vehicleType ?? null,
    rating:Number(item.rating ?? 0),
    totalDeliveries:Number(item.totalDeliveries ?? 0),
    isOnline:Boolean(item.isOnline),
    requestedAt:item.requestedAt ?? new Date().toISOString(),
  }))

  return {
    storeId:body.storeId ?? storeId,
    connected,
    pending,
  }
}

function courierParityDigest(rows:MigrationStoreCourier[]) {
  return rows
    .map(item => ({
      id:item.id,
      online:item.isOnline,
      available:item.isAvailable,
      rating:item.rating.toFixed(2),
      total:item.totalDeliveries,
      activeDelivery:item.activeDelivery?.id ?? null,
    }))
    .sort((a,b) => a.id.localeCompare(b.id))
}

function logCourierParity(
  storeId:string,
  label:string | null,
  mysqlRows:MigrationStoreCourier[],
  supabaseRows:MigrationStoreCourier[],
) {
  const mysql = courierParityDigest(mysqlRows)
  const supabase = courierParityDigest(supabaseRows)
  const source = new Map(supabase.map(item => [item.id,item]))
  const target = new Map(mysql.map(item => [item.id,item]))
  const onlyMysql = mysql.filter(item => !source.has(item.id)).map(item => item.id)
  const onlySupabase = supabase.filter(item => !target.has(item.id)).map(item => item.id)
  const mismatched = mysql.filter(item => {
    const compare = source.get(item.id)
    return compare && JSON.stringify(compare) !== JSON.stringify(item)
  })

  if (!onlyMysql.length && !onlySupabase.length && !mismatched.length) {
    console.info('[mysql-parity] couriers match', { storeId, label, count:mysql.length })
    return
  }

  console.warn('[mysql-parity] courier divergence', {
    storeId,
    label,
    mysqlCount:mysql.length,
    supabaseCount:supabase.length,
    onlyMysql:onlyMysql.slice(0,20),
    onlySupabase:onlySupabase.slice(0,20),
    mismatched:mismatched.slice(0,20),
  })
}

export async function migrationStoreCouriersWithFallback(
  storeId:string,
  supabaseLoader:() => Promise<{
    connected:MigrationStoreCourier[]
    pending:MigrationStoreCourierRequest[]
  }>,
  options:{ label?:string } = {},
):Promise<{
  connected:MigrationStoreCourier[]
  pending:MigrationStoreCourierRequest[]
  source:'mysql'|'supabase'
}> {
  const readEnabled = isMigrationReadEnabled()
  const compareEnabled = isMigrationReadCompareEnabled()
  const label = options.label ?? null

  if (!readEnabled && !compareEnabled) {
    const supabase = await supabaseLoader()
    return { ...supabase, source:'supabase' }
  }

  if (!readEnabled && compareEnabled) {
    const supabase = await supabaseLoader()
    try {
      const mysql = await listMigrationStoreCouriers(storeId)
      logCourierParity(storeId, label, mysql.connected, supabase.connected)
    } catch (error) {
      console.error('[mysql-parity] courier comparison failed', {
        storeId,
        label,
        error:error instanceof Error ? error.message : 'unknown_mysql_compare_error',
      })
    }
    return { ...supabase, source:'supabase' }
  }

  try {
    const mysql = await listMigrationStoreCouriers(storeId)

    if (compareEnabled) {
      try {
        const supabase = await supabaseLoader()
        logCourierParity(storeId, label, mysql.connected, supabase.connected)
      } catch (error) {
        console.error('[mysql-parity] Supabase courier comparison failed', {
          storeId,
          label,
          error:error instanceof Error ? error.message : 'unknown_supabase_compare_error',
        })
      }
    }

    return {
      connected:mysql.connected,
      pending:mysql.pending,
      source:'mysql',
    }
  } catch (error) {
    console.error('[mysql-read] courier fallback to Supabase', {
      storeId,
      label,
      error:error instanceof Error ? error.message : 'unknown_mysql_courier_read_error',
    })
    const supabase = await supabaseLoader()
    return { ...supabase, source:'supabase' }
  }
}
