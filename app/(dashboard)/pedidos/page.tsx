import { requireStore } from '@/lib/auth'
import { getOperationalRepository } from '@/lib/data/get-operational-repository'
import { IntegratedOrdersBoard, type IntegratedOrder, type LinkedDelivery } from '@/components/integrated-orders-board'

const STORE_TIME_ZONE = 'America/Sao_Paulo'

function dayKey(value:string | Date) {
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:STORE_TIME_ZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

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
  const repository = getOperationalRepository()

  const [orderRows, allDeliveryRows] = await Promise.all([
    repository.listStoreOrders(store.id, 250),
    repository.listDeliveriesByStore(store.id, 250),
  ])
  const todayKey = dayKey(new Date())
  const deliveryRows = allDeliveryRows.filter(row =>
    row.status !== 'draft' && dayKey(row.created_at) === todayKey
  )
  const todayOrderRows = orderRows.filter((row:any) =>
    dayKey(row.received_at ?? row.created_at) === todayKey
  )

  const integratedOrders:IntegratedOrder[] = todayOrderRows.map((row:any) => ({
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

  const standaloneDeliveryOrders:IntegratedOrder[] = deliveryRows
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
      deliveryRows
        .map((row:any) => row.assigned_courier_id)
        .filter(Boolean) as string[],
    ),
  )

  const [allCouriers, profileRows] = courierIds.length
    ? await Promise.all([
        repository.listCouriers(),
        repository.listCourierProfilesByIds(courierIds),
      ])
    : [[], []]

  const courierMap = new Map(
    allCouriers
      .filter(row => courierIds.includes(row.id))
      .map(row => [row.id,row]),
  )
  const profileMap = new Map(profileRows.map(row => [row.id,row]))

  const linkedDeliveries: LinkedDelivery[] = deliveryRows.map((row:any) => {
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
