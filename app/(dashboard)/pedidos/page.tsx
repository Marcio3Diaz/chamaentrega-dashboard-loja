import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { IntegratedOrdersBoard, type IntegratedOrder, type LinkedDelivery } from '@/components/integrated-orders-board'

function statusFromDelivery(status:string):IntegratedOrder['status'] {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled' || status === 'expired') return 'cancelled'
  if (['accepted','heading_to_pickup','at_pickup','heading_to_dropoff','at_dropoff'].includes(status)) return 'in_route'
  if (['available','negotiating'].includes(status)) return 'seeking_courier'
  return 'seeking_courier'
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string,string | string[] | undefined>>
}) {
  const params = searchParams ? await searchParams : {}
  const initialSelectedId = typeof params.pedido === 'string' ? params.pedido : null
  const initialMessage = typeof params.message === 'string' ? params.message : ''
  const { store } = await requireStore()
  const supabase = await createClient()

  const [{ data: orderRows }, { data: deliveryRows }] = await Promise.all([
    supabase
      .from('store_orders')
      .select('id,store_id,source,external_order_id,status,fulfillment_type,customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,items,order_total,payment_method,payment_status,customer_note,delivery_id,source_metadata,received_at,created_at,updated_at')
      .eq('store_id', store.id)
      .order('received_at', { ascending:false })
      .limit(250),
    supabase
      .from('deliveries')
      .select('id,store_id,status,assigned_courier_id,delivery_fee,estimated_minutes,updated_at,external_order_id,customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,order_total,payment_method,customer_note,created_at,item_count')
      .eq('store_id', store.id)
      .neq('status','draft')
      .order('created_at', { ascending:false })
      .limit(250),
  ])

  const integratedOrders:IntegratedOrder[] = (orderRows ?? []).map((row:any) => ({
    id: row.id,
    storeId: row.store_id,
    source: row.source,
    externalOrderId: row.external_order_id,
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address,
    deliveryLatitude: row.delivery_latitude == null ? null : Number(row.delivery_latitude),
    deliveryLongitude: row.delivery_longitude == null ? null : Number(row.delivery_longitude),
    items: Array.isArray(row.items) ? row.items : [],
    orderTotal: Number(row.order_total ?? 0),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    customerNote: row.customer_note,
    deliveryId: row.delivery_id,
    sourceMetadata: row.source_metadata ?? {},
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const linkedDeliveryIds = new Set(
    integratedOrders.map(order => order.deliveryId).filter(Boolean) as string[],
  )

  const standaloneDeliveryOrders:IntegratedOrder[] = (deliveryRows ?? [])
    .filter((row:any) => !linkedDeliveryIds.has(row.id))
    .map((row:any) => ({
      id: `delivery:${row.id}`,
      storeId: row.store_id,
      source: 'manual',
      externalOrderId: row.external_order_id || row.id.replaceAll('-','').slice(0,7).toUpperCase(),
      status: statusFromDelivery(row.status),
      fulfillmentType: 'delivery',
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      deliveryAddress: row.delivery_address,
      deliveryLatitude: row.delivery_latitude == null ? null : Number(row.delivery_latitude),
      deliveryLongitude: row.delivery_longitude == null ? null : Number(row.delivery_longitude),
      items: [],
      orderTotal: Number(row.order_total ?? 0),
      paymentMethod: row.payment_method ?? 'unknown',
      paymentStatus: 'unknown',
      customerNote: row.customer_note,
      deliveryId: row.id,
      sourceMetadata: {
        standaloneDelivery:true,
        itemCount:Number(row.item_count ?? 0),
      },
      receivedAt: row.created_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

  const orders = [...integratedOrders,...standaloneDeliveryOrders]
    .sort((a,b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())

  const courierIds = Array.from(
    new Set(
      (deliveryRows ?? [])
        .map((row:any) => row.assigned_courier_id)
        .filter(Boolean) as string[],
    ),
  )

  const [{ data: courierRows }, { data: profileRows }] = courierIds.length
    ? await Promise.all([
        supabase
          .from('couriers')
          .select('id,vehicle_type')
          .in('id', courierIds),
        supabase
          .from('profiles')
          .select('id,full_name,avatar_url')
          .in('id', courierIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  const courierMap = new Map((courierRows ?? []).map((row:any) => [row.id,row]))
  const profileMap = new Map((profileRows ?? []).map((row:any) => [row.id,row]))

  const linkedDeliveries: LinkedDelivery[] = (deliveryRows ?? []).map((row:any) => {
    const courier = row.assigned_courier_id ? courierMap.get(row.assigned_courier_id) : null
    const profile = row.assigned_courier_id ? profileMap.get(row.assigned_courier_id) : null

    return {
      id: row.id,
      status: row.status,
      assignedCourierId: row.assigned_courier_id,
      assignedCourierName: profile?.full_name ?? null,
      assignedCourierVehicle: courier?.vehicle_type ?? null,
      assignedCourierAvatarUrl: profile?.avatar_url ?? null,
      deliveryFee: Number(row.delivery_fee ?? 0),
      estimatedMinutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
      updatedAt: row.updated_at,
    }
  })

  return (
    <IntegratedOrdersBoard
      storeId={store.id}
      initialOrders={orders}
      initialDeliveries={linkedDeliveries}
      initialSelectedId={initialSelectedId}
      initialMessage={initialMessage}
    />
  )
}
