'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type CreateState = { error?: string }

const n = (v: FormDataEntryValue | null) => {
  const x = Number(String(v ?? '').replace(',','.'))
  return Number.isFinite(x) ? x : null
}

export async function createDeliveryAction(_: CreateState, formData: FormData): Promise<CreateState> {
  const { store } = await requireStore()
  const customerName = String(formData.get('customer_name') ?? '').trim()
  const deliveryAddress = String(formData.get('delivery_address') ?? '').trim()
  const deliveryFee = n(formData.get('delivery_fee'))
  const intent = String(formData.get('intent') ?? 'draft')
  const storeOrderId = String(formData.get('store_order_id') ?? '').trim() || null

  if (!customerName || !deliveryAddress || deliveryFee === null || deliveryFee < 0) {
    return { error:'Preencha cliente, endereço e taxa de entrega.' }
  }

  const published = intent === 'publish'
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
    if (['completed','cancelled'].includes(data.status)) return { error:'Este pedido não pode mais gerar uma entrega.' }

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
      delivery_latitude: n(formData.get('delivery_latitude')),
      delivery_longitude: n(formData.get('delivery_longitude')),
      delivery_fee: deliveryFee,
      pickup_distance_km: n(formData.get('pickup_distance_km')),
      delivery_distance_km: n(formData.get('delivery_distance_km')),
      estimated_minutes: n(formData.get('estimated_minutes')),
      payment_method: String(formData.get('payment_method') ?? 'already_paid'),
      order_total: n(formData.get('order_total')),
      customer_name: customerName,
      customer_phone: String(formData.get('customer_phone') ?? '').trim() || null,
      customer_note: String(formData.get('customer_note') ?? '').trim() || null,
      item_count: Math.max(1, Math.round(n(formData.get('item_count')) ?? 1)),
      package_weight_kg: n(formData.get('package_weight_kg')),
      seconds_to_accept: 300,
      published_at: published ? now.toISOString() : null,
      ready_at: published ? now.toISOString() : null,
      expires_at: published ? expires.toISOString() : null,
    })
    .select('id')
    .single()

  if (error || !delivery) return { error: error?.message ?? 'Não foi possível criar a entrega.' }

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
      await supabase.from('deliveries').delete().eq('id',delivery.id).eq('store_id',store.id)
      return { error:'A entrega foi revertida porque não foi possível vinculá-la ao pedido integrado.' }
    }
  }

  revalidatePath('/')
  revalidatePath('/pedidos')
  revalidatePath('/entregas')
  redirect(storeOrderId ? '/pedidos' : '/entregas')
}
