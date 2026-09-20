import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { IntegratedOrdersBoard, type IntegratedOrder, type LinkedDelivery } from '@/components/integrated-orders-board'

export default async function OrdersPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const { data: orderRows } = await supabase
    .from('store_orders')
    .select('id,store_id,source,external_order_id,status,fulfillment_type,customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,items,order_total,payment_method,payment_status,customer_note,delivery_id,source_metadata,received_at,created_at,updated_at')
    .eq('store_id', store.id)
    .order('received_at', { ascending:false })
    .limit(250)

  const deliveryIds = Array.from(
    new Set((orderRows ?? []).map(row => row.delivery_id).filter(Boolean) as string[]),
  )

  const { data: deliveryRows } = deliveryIds.length
    ? await supabase
        .from('deliveries')
        .select('id,status,assigned_courier_id,delivery_fee,estimated_minutes,updated_at')
        .in('id', deliveryIds)
    : { data: [] as any[] }

  const orders: IntegratedOrder[] = (orderRows ?? []).map((row:any) => ({
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

  const linkedDeliveries: LinkedDelivery[] = (deliveryRows ?? []).map((row:any) => ({
    id: row.id,
    status: row.status,
    assignedCourierId: row.assigned_courier_id,
    deliveryFee: Number(row.delivery_fee ?? 0),
    estimatedMinutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    updatedAt: row.updated_at,
  }))

  return (
    <IntegratedOrdersBoard
      storeId={store.id}
      initialOrders={orders}
      initialDeliveries={linkedDeliveries}
    />
  )
}
