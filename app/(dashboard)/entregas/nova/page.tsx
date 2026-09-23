import {
  CreateDeliveryForm,
  type DeliveryOrderPrefill,
  type DeliveryPricingConfig,
} from './create-form'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

type NewDeliveryPageProps = {
  searchParams?: Promise<{ order?: string }>
}

export default async function NewDeliveryPage({ searchParams }: NewDeliveryPageProps) {
  const { store } = await requireStore()
  const supabase = await createClient()
  const params = searchParams ? await searchParams : {}
  const orderId = params.order?.trim() || null

  const [
    { data: walletRows },
    orderResult,
    { data: pricingRow },
  ] = await Promise.all([
    supabase.rpc('get_my_store_wallet', { p_store_id: store.id }),
    orderId
      ? supabase
          .from('store_orders')
          .select('id,external_order_id,customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,items,order_total,payment_method,customer_note,delivery_id,status')
          .eq('id', orderId)
          .eq('store_id', store.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('delivery_pricing_settings')
      .select('enabled,minimum_fee,included_km,per_extra_km,road_factor,round_step')
      .eq('store_id',store.id)
      .maybeSingle(),
  ])

  const wallet = walletRows?.[0]
  const availableBalance = Number(wallet?.available_balance ?? 0)
  const reservedBalance = Number(wallet?.reserved_balance ?? 0)

  const sourceOrder = orderResult.data as any
  const items = Array.isArray(sourceOrder?.items) ? sourceOrder.items : []
  const itemCount = items.reduce((sum:number,item:any) => sum + Math.max(1,Number(item?.quantity ?? 1)),0)

  const initialOrder: DeliveryOrderPrefill | null = sourceOrder && !sourceOrder.delivery_id
    ? {
        orderId: sourceOrder.id,
        externalOrderId: sourceOrder.external_order_id,
        customerName: sourceOrder.customer_name ?? '',
        customerPhone: sourceOrder.customer_phone ?? '',
        deliveryAddress: sourceOrder.delivery_address ?? '',
        deliveryLatitude: sourceOrder.delivery_latitude == null ? '' : String(sourceOrder.delivery_latitude),
        deliveryLongitude: sourceOrder.delivery_longitude == null ? '' : String(sourceOrder.delivery_longitude),
        orderTotal: sourceOrder.order_total == null ? '' : String(sourceOrder.order_total),
        paymentMethod: ['already_paid','pix','cash','card_on_delivery'].includes(sourceOrder.payment_method)
          ? sourceOrder.payment_method
          : 'already_paid',
        customerNote: sourceOrder.customer_note ?? '',
        itemCount: Math.max(1,itemCount || 1),
      }
    : null

  const pricing: DeliveryPricingConfig = {
    enabled: Boolean(pricingRow?.enabled ?? true),
    minimumFee: Number(pricingRow?.minimum_fee ?? 7.5),
    includedKm: Number(pricingRow?.included_km ?? 2),
    perExtraKm: Number(pricingRow?.per_extra_km ?? 1.5),
    roadFactor: Number(pricingRow?.road_factor ?? 1.25),
    roundStep: Number(pricingRow?.round_step ?? .5),
  }

  return <>
    <div className="hero">
      <div>
        <div className="eyebrow">{initialOrder ? 'Pedido integrado' : 'Nova corrida'}</div>
        <h1>Criar entrega</h1>
        <p className="subtle">
          {initialOrder
            ? `Dados do pedido #${initialOrder.externalOrderId || initialOrder.orderId.replaceAll('-','').slice(0,7).toUpperCase()} carregados. Localize o endereço e revise a taxa antes de publicar.`
            : 'Cadastre o destino. O ChamaEntrega calcula automaticamente localização, distância, tempo e taxa sugerida.'}
        </p>
      </div>
    </div>

    <CreateDeliveryForm
      availableBalance={availableBalance}
      reservedBalance={reservedBalance}
      initialOrder={initialOrder}
      storeLatitude={store.latitude == null ? null : Number(store.latitude)}
      storeLongitude={store.longitude == null ? null : Number(store.longitude)}
      storeCity={store.city ?? null}
      storeState={store.state ?? null}
      pricing={pricing}
    />
  </>
}
