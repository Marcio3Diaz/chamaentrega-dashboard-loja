import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BODY_BYTES = 8 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function unauthorized() {
  return NextResponse.json({ detail:'Não autorizado.' },{ status:401 })
}

function safeSecretEquals(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied,'utf8')
  const expectedBuffer = Buffer.from(expected,'utf8')

  if (suppliedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(suppliedBuffer,expectedBuffer)
}

function exactObject(value: unknown, allowedKeys: Set<string>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const object = value as Record<string,unknown>
  if (Object.keys(object).some(key => !allowedKeys.has(key))) return null
  return object
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) return null
  return normalized
}

async function geocodeAddress(address: string) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY não configurada.')
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address',address)
  url.searchParams.set('key',apiKey)
  url.searchParams.set('language','pt-BR')
  url.searchParams.set('region','br')

  const response = await fetch(url,{
    cache:'no-store',
    signal:AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`Falha de geocodificação HTTP ${response.status}.`)
  }

  const data = await response.json() as {
    status?: string
    results?: Array<{
      geometry?: {
        location?: { lat?: number; lng?: number }
      }
    }>
  }

  const location = data.results?.[0]?.geometry?.location
  if (
    data.status !== 'OK'
    || typeof location?.lat !== 'number'
    || typeof location?.lng !== 'number'
  ) {
    throw new Error('Endereço de destino não pôde ser localizado.')
  }

  return {
    latitude:location.lat,
    longitude:location.lng,
  }
}

export async function POST(request: Request) {
  const expectedApiKey = process.env.SERAFINA_API_KEY?.trim() ?? ''
  const storeId = process.env.SERAFINA_STORE_ID?.trim() ?? ''

  if (!expectedApiKey || !storeId || !UUID_RE.test(storeId)) {
    return NextResponse.json(
      { detail:'Integração Serafina indisponível por configuração.' },
      { status:503 },
    )
  }

  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return unauthorized()

  const suppliedApiKey = authorization.slice('Bearer '.length).trim()
  if (!safeSecretEquals(suppliedApiKey,expectedApiKey)) return unauthorized()

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) {
    return NextResponse.json({ detail:'Envie application/json.' },{ status:415 })
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength) {
    const parsedLength = Number(declaredLength)
    if (!Number.isInteger(parsedLength) || parsedLength < 0) {
      return NextResponse.json({ detail:'Content-Length inválido.' },{ status:400 })
    }
    if (parsedLength > MAX_BODY_BYTES) {
      return NextResponse.json({ detail:'Payload muito grande.' },{ status:413 })
    }
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody,'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ detail:'Payload muito grande.' },{ status:413 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ detail:'JSON inválido.' },{ status:422 })
  }

  const body = exactObject(
    parsed,
    new Set(['external_order_id','customer','destination','delivery_fee']),
  )
  if (!body) {
    return NextResponse.json({ detail:'Payload inválido.' },{ status:422 })
  }

  const customer = exactObject(body.customer,new Set(['name','phone']))
  const destination = exactObject(body.destination,new Set(['address']))
  const externalOrderId = boundedString(body.external_order_id,30)
  const customerName = boundedString(customer?.name,120)
  const customerPhone = boundedString(customer?.phone,25)
  const address = boundedString(destination?.address,300)
  const deliveryFee = typeof body.delivery_fee === 'number' ? body.delivery_fee : Number.NaN

  if (
    !externalOrderId
    || !customerName
    || !customerPhone
    || !address
    || !Number.isFinite(deliveryFee)
    || deliveryFee < 0
    || deliveryFee > 100_000
  ) {
    return NextResponse.json({ detail:'Dados da entrega inválidos.' },{ status:422 })
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? ''
  if (idempotencyKey !== `serafina:${externalOrderId}`) {
    return NextResponse.json({ detail:'Idempotency-Key inválida.' },{ status:422 })
  }

  const supabase = createAdminClient()

  const { data:existingOrder,error:existingError } = await supabase
    .from('store_orders')
    .select('id,delivery_id,external_order_id')
    .eq('store_id',storeId)
    .eq('source','own_menu')
    .eq('external_order_id',externalOrderId)
    .maybeSingle()

  if (existingError) {
    console.error('[api/deliveries] falha ao consultar idempotência',{
      code:existingError.code,
    })
    return NextResponse.json({ detail:'Não foi possível consultar a entrega.' },{ status:500 })
  }

  if (existingOrder?.delivery_id) {
    return NextResponse.json({
      id:existingOrder.delivery_id,
      delivery_id:existingOrder.delivery_id,
      external_order_id:externalOrderId,
      duplicate:true,
    })
  }

  const { data:store,error:storeError } = await supabase
    .from('stores')
    .select('id,address,latitude,longitude,is_active,moderation_status')
    .eq('id',storeId)
    .maybeSingle()

  if (
    storeError
    || !store
    || !store.is_active
    || store.moderation_status !== 'active'
    || typeof store.latitude !== 'number'
    || typeof store.longitude !== 'number'
  ) {
    return NextResponse.json(
      { detail:'Loja da integração indisponível para entregas.' },
      { status:409 },
    )
  }

  let destinationCoordinates: { latitude:number; longitude:number }
  try {
    destinationCoordinates = await geocodeAddress(address)
  } catch (error) {
    console.error('[api/deliveries] geocodificação falhou',{
      externalOrderId,
      error:error instanceof Error ? error.message : 'erro desconhecido',
    })
    return NextResponse.json({ detail:'Endereço de entrega não localizado.' },{ status:422 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000)

  const { data:delivery,error:deliveryError } = await supabase
    .from('deliveries')
    .insert({
      store_id:storeId,
      external_order_id:externalOrderId,
      status:'available',
      pickup_address:store.address,
      pickup_latitude:store.latitude,
      pickup_longitude:store.longitude,
      delivery_address:address,
      delivery_latitude:destinationCoordinates.latitude,
      delivery_longitude:destinationCoordinates.longitude,
      delivery_fee:deliveryFee,
      payment_method:'already_paid',
      customer_name:customerName,
      customer_phone:customerPhone,
      item_count:1,
      seconds_to_accept:300,
      published_at:now.toISOString(),
      ready_at:now.toISOString(),
      expires_at:expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (deliveryError || !delivery) {
    console.error('[api/deliveries] insert da entrega falhou',{
      externalOrderId,
      code:deliveryError?.code ?? null,
    })
    return NextResponse.json({ detail:'Não foi possível criar a entrega.' },{ status:500 })
  }

  const { data:storeOrder,error:orderError } = await supabase
    .from('store_orders')
    .insert({
      store_id:storeId,
      source:'own_menu',
      external_order_id:externalOrderId,
      status:'seeking_courier',
      fulfillment_type:'delivery',
      customer_name:customerName,
      customer_phone:customerPhone,
      delivery_address:address,
      delivery_latitude:destinationCoordinates.latitude,
      delivery_longitude:destinationCoordinates.longitude,
      items:[],
      order_total:0,
      payment_method:'unknown',
      payment_status:'unknown',
      delivery_id:delivery.id,
      source_metadata:{
        integration:'serafina-app',
        webhook_target:'serafina',
      },
    })
    .select('id')
    .single()

  if (orderError || !storeOrder) {
    await supabase
      .from('deliveries')
      .delete()
      .eq('id',delivery.id)
      .eq('store_id',storeId)

    const { data:racedOrder } = await supabase
      .from('store_orders')
      .select('delivery_id')
      .eq('store_id',storeId)
      .eq('source','own_menu')
      .eq('external_order_id',externalOrderId)
      .maybeSingle()

    if (racedOrder?.delivery_id) {
      return NextResponse.json({
        id:racedOrder.delivery_id,
        delivery_id:racedOrder.delivery_id,
        external_order_id:externalOrderId,
        duplicate:true,
      })
    }

    console.error('[api/deliveries] vínculo do pedido falhou',{
      externalOrderId,
      code:orderError?.code ?? null,
    })
    return NextResponse.json({ detail:'Não foi possível vincular o pedido à entrega.' },{ status:500 })
  }

  return NextResponse.json({
    id:delivery.id,
    delivery_id:delivery.id,
    external_order_id:externalOrderId,
    duplicate:false,
  },{ status:201 })
}
