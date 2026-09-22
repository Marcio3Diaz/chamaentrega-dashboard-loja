'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type CreateState = { error?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAYMENT_METHODS = new Set([
  'already_paid',
  'cash',
  'pix',
  'card_on_delivery',
])

function text(formData:FormData,key:string,maxLength:number) {
  return String(formData.get(key) ?? '').trim().slice(0,maxLength)
}

function numberValue(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim().replace(',','.')
  if (!raw) return null

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function boundedNumber(
  value:FormDataEntryValue | null,
  min:number,
  maxExclusive:number,
) {
  const parsed = numberValue(value)
  if (parsed === null) return null
  return parsed >= min && parsed < maxExclusive ? parsed : null
}

export async function createDeliveryAction(
  _: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const { store } = await requireStore()

  const customerName = text(formData,'customer_name',160)
  const deliveryAddress = text(formData,'delivery_address',350)
  const customerPhone = text(formData,'customer_phone',40) || null
  const customerNote = text(formData,'customer_note',1000) || null
  const paymentMethod = text(formData,'payment_method',40) || 'already_paid'
  const intent = text(formData,'intent',20) || 'draft'
  const rawStoreOrderId = text(formData,'store_order_id',64)
  const storeOrderId = rawStoreOrderId && UUID_RE.test(rawStoreOrderId)
    ? rawStoreOrderId
    : null

  const deliveryFee = boundedNumber(formData.get('delivery_fee'),0,100_000_000)

  if (!customerName || !deliveryAddress || deliveryFee === null) {
    return { error:'Preencha cliente, endereço e uma taxa de entrega válida.' }
  }

  if (rawStoreOrderId && !storeOrderId) {
    return { error:'O pedido integrado informado é inválido.' }
  }

  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return { error:'Forma de pagamento inválida.' }
  }

  if (!['draft','publish'].includes(intent)) {
    return { error:'Ação de criação inválida.' }
  }

  const published = intent === 'publish'
  const deliveryLatitude = numberValue(formData.get('delivery_latitude'))
  const deliveryLongitude = numberValue(formData.get('delivery_longitude'))

  const coordinatesValid =
    deliveryLatitude !== null
    && deliveryLatitude >= -90
    && deliveryLatitude <= 90
    && deliveryLongitude !== null
    && deliveryLongitude >= -180
    && deliveryLongitude <= 180

  if (published && !coordinatesValid) {
    return { error:'Localize um endereço válido antes de publicar a entrega.' }
  }

  const pickupDistanceKm = formData.get('pickup_distance_km')
    ? boundedNumber(formData.get('pickup_distance_km'),0,1_000_000)
    : null
  const deliveryDistanceKm = formData.get('delivery_distance_km')
    ? boundedNumber(formData.get('delivery_distance_km'),0,1_000_000)
    : null
  const estimatedMinutesRaw = numberValue(formData.get('estimated_minutes'))
  const estimatedMinutes = estimatedMinutesRaw === null
    ? null
    : Number.isInteger(estimatedMinutesRaw)
      && estimatedMinutesRaw >= 0
      && estimatedMinutesRaw <= 2_147_483_647
        ? estimatedMinutesRaw
        : null
  const orderTotal = formData.get('order_total')
    ? boundedNumber(formData.get('order_total'),0,100_000_000)
    : null
  const packageWeightKg = formData.get('package_weight_kg')
    ? boundedNumber(formData.get('package_weight_kg'),0,1_000_000)
    : null

  const itemCountRaw = numberValue(formData.get('item_count'))
  const itemCount = itemCountRaw === null
    ? 1
    : Math.round(itemCountRaw)

  if (itemCount < 1 || itemCount > 2_147_483_647) {
    return { error:'Quantidade de itens inválida.' }
  }

  const numericFields = [
    ['distância de coleta',formData.get('pickup_distance_km'),pickupDistanceKm],
    ['distância de entrega',formData.get('delivery_distance_km'),deliveryDistanceKm],
    ['tempo estimado',formData.get('estimated_minutes'),estimatedMinutes],
    ['valor do pedido',formData.get('order_total'),orderTotal],
    ['peso do pacote',formData.get('package_weight_kg'),packageWeightKg],
  ] as const

  const invalidNumeric = numericFields.find(([,raw,parsed]) =>
    String(raw ?? '').trim() !== '' && parsed === null
  )

  if (invalidNumeric) {
    return { error:`Valor inválido em ${invalidNumeric[0]}.` }
  }

  const now = new Date()
  const expires = new Date(now.getTime() + 5 * 60 * 1000)
  const supabase = await createClient()

  let integratedOrder: {
    id:string
    external_order_id:string | null
    delivery_id:string | null
    status:string
  } | null = null

  if (storeOrderId) {
    const { data,error } = await supabase
      .from('store_orders')
      .select('id,external_order_id,delivery_id,status')
      .eq('id',storeOrderId)
      .eq('store_id',store.id)
      .maybeSingle()

    if (error || !data) return { error:'Pedido integrado não encontrado.' }
    if (data.delivery_id) return { error:'Este pedido já possui uma entrega vinculada.' }
    if (['completed','cancelled'].includes(data.status)) {
      return { error:'Este pedido não pode mais gerar uma entrega.' }
    }

    integratedOrder = data
  }

  const { data:delivery,error } = await supabase
    .from('deliveries')
    .insert({
      store_id: store.id,
      external_order_id: integratedOrder?.external_order_id ?? null,
      status: published ? 'available' : 'draft',
      pickup_address: store.address,
      pickup_latitude: store.latitude,
      pickup_longitude: store.longitude,
      delivery_address: deliveryAddress,
      delivery_latitude: coordinatesValid ? deliveryLatitude : null,
      delivery_longitude: coordinatesValid ? deliveryLongitude : null,
      delivery_fee: deliveryFee,
      pickup_distance_km: pickupDistanceKm,
      delivery_distance_km: deliveryDistanceKm,
      estimated_minutes: estimatedMinutes,
      payment_method: paymentMethod,
      order_total: orderTotal,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_note: customerNote,
      item_count: itemCount,
      package_weight_kg: packageWeightKg,
      seconds_to_accept: 300,
      published_at: published ? now.toISOString() : null,
      ready_at: published ? now.toISOString() : null,
      expires_at: published ? expires.toISOString() : null,
    })
    .select('id')
    .single()

  if (error || !delivery) {
    return { error:'Não foi possível criar a entrega. Confira os dados e tente novamente.' }
  }

  if (storeOrderId) {
    const { data:linkedOrder,error:linkError } = await supabase
      .from('store_orders')
      .update({
        delivery_id: delivery.id,
        status: published ? 'seeking_courier' : 'ready',
      })
      .eq('id',storeOrderId)
      .eq('store_id',store.id)
      .is('delivery_id',null)
      .select('id')
      .maybeSingle()

    if (linkError || !linkedOrder) {
      await supabase
        .from('deliveries')
        .delete()
        .eq('id',delivery.id)
        .eq('store_id',store.id)

      return {
        error:'A entrega foi revertida porque não foi possível vinculá-la ao pedido integrado.',
      }
    }
  }

  revalidatePath('/')
  revalidatePath('/pedidos')
  revalidatePath('/entregas')
  revalidatePath('/despacho')
  redirect(storeOrderId ? '/pedidos' : '/entregas')
}
