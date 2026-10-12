import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BODY_BYTES = 4 * 1024
const MAX_CLOCK_SKEW_SECONDS = 5 * 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIVE_STATUSES = new Set([
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'picked_up',
  'heading_to_dropoff',
  'on_the_way',
  'at_dropoff',
])

function unauthorized() {
  return NextResponse.json({ detail: 'Não autorizado.' }, { status: 401 })
}

function safeEqualHex(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (suppliedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(suppliedBuffer, expectedBuffer)
}

function exactObject(value: unknown, allowedKeys: Set<string>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const object = value as Record<string, unknown>
  if (Object.keys(object).some(key => !allowedKeys.has(key))) return null
  return object
}

export async function POST(request: Request) {
  const sharedSecret = process.env.SERAFINA_WEBHOOK_SECRET?.trim() ?? ''
  const storeId = process.env.SERAFINA_STORE_ID?.trim() ?? ''
  if (!sharedSecret || sharedSecret.length < 24 || !UUID_RE.test(storeId)) {
    return NextResponse.json(
      { detail: 'Integração Serafina indisponível por configuração.' },
      { status: 503 },
    )
  }

  const timestampHeader = request.headers.get('x-serafina-timestamp')?.trim() ?? ''
  const signatureHeader = request.headers.get('x-serafina-signature')?.trim() ?? ''
  const timestamp = Number(timestampHeader)
  if (!Number.isInteger(timestamp)) return unauthorized()

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) return unauthorized()

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: 'Payload muito grande.' }, { status: 413 })
  }

  const expectedSignature = createHmac('sha256', sharedSecret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest('hex')
  const suppliedSignature = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : ''
  if (!suppliedSignature || !safeEqualHex(suppliedSignature, expectedSignature)) {
    return unauthorized()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ detail: 'JSON inválido.' }, { status: 422 })
  }

  const body = exactObject(parsed, new Set(['delivery_id']))
  const deliveryId = typeof body?.delivery_id === 'string'
    ? body.delivery_id.trim()
    : ''
  if (!UUID_RE.test(deliveryId)) {
    return NextResponse.json({ detail: 'Entrega inválida.' }, { status: 422 })
  }

  const supabase = createAdminClient()
  const { data: delivery, error: deliveryError } = await supabase
    .from('deliveries')
    .select(
      'id,status,external_order_id,assigned_courier_id,pickup_address,pickup_latitude,pickup_longitude,delivery_address,delivery_latitude,delivery_longitude,delivery_fee,estimated_minutes,updated_at,completed_at',
    )
    .eq('id', deliveryId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (deliveryError) {
    console.error('[api/deliveries/details] falha ao consultar entrega', {
      code: deliveryError.code,
    })
    return NextResponse.json({ detail: 'Não foi possível consultar a entrega.' }, { status: 500 })
  }
  if (!delivery) {
    return NextResponse.json({ detail: 'Entrega não encontrada.' }, { status: 404 })
  }

  const isActive = ACTIVE_STATUSES.has(delivery.status)
  let courier: Record<string, unknown> | null = null
  let routePoints: Array<Record<string, unknown>> = []

  if (delivery.assigned_courier_id) {
    const courierId = delivery.assigned_courier_id
    const [{ data: courierRow }, { data: profileRow }] = await Promise.all([
      supabase
        .from('couriers')
        .select('vehicle_type,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
        .eq('id', courierId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('full_name,avatar_url')
        .eq('id', courierId)
        .maybeSingle(),
    ])

    courier = {
      name: profileRow?.full_name ?? 'Entregador parceiro',
      avatar_url: profileRow?.avatar_url ?? null,
      vehicle_type: courierRow?.vehicle_type ?? null,
      rating: courierRow?.rating == null ? null : Number(courierRow.rating),
      total_deliveries:
        courierRow?.total_deliveries == null ? null : Number(courierRow.total_deliveries),
      current_latitude:
        isActive && courierRow?.current_latitude != null
          ? Number(courierRow.current_latitude)
          : null,
      current_longitude:
        isActive && courierRow?.current_longitude != null
          ? Number(courierRow.current_longitude)
          : null,
      last_location_at: isActive ? courierRow?.last_location_at ?? null : null,
    }

    if (isActive) {
      const { data: pointRows, error: pointsError } = await supabase
        .from('delivery_location_points')
        .select('id,latitude,longitude,recorded_at')
        .eq('delivery_id', deliveryId)
        .eq('courier_id', courierId)
        .order('recorded_at', { ascending: false })
        .limit(500)

      if (!pointsError) {
        routePoints = (pointRows ?? []).reverse().map(point => ({
          id: point.id,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          recorded_at: point.recorded_at,
        }))
      }
    }
  }

  return NextResponse.json({
    id: delivery.id,
    delivery_id: delivery.id,
    status: delivery.status,
    external_order_id: delivery.external_order_id,
    pickup_address: delivery.pickup_address,
    pickup_latitude:
      delivery.pickup_latitude == null ? null : Number(delivery.pickup_latitude),
    pickup_longitude:
      delivery.pickup_longitude == null ? null : Number(delivery.pickup_longitude),
    delivery_address: delivery.delivery_address,
    delivery_latitude:
      delivery.delivery_latitude == null ? null : Number(delivery.delivery_latitude),
    delivery_longitude:
      delivery.delivery_longitude == null ? null : Number(delivery.delivery_longitude),
    delivery_fee: Number(delivery.delivery_fee ?? 0),
    estimated_minutes:
      delivery.estimated_minutes == null ? null : Number(delivery.estimated_minutes),
    updated_at: delivery.updated_at,
    completed_at: delivery.completed_at,
    courier,
    route_points: routePoints,
  })
}
