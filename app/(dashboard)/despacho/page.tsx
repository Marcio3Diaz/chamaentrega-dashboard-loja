import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SmartDispatchBoard, type DispatchCourier, type DispatchDelivery } from '@/components/smart-dispatch-board'

const queueStatuses = ['draft','available','negotiating'] as const

export default async function SmartDispatchPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const { data: deliveryRows } = await supabase
    .from('deliveries')
    .select('id,external_order_id,status,delivery_address,delivery_latitude,delivery_longitude,delivery_fee,delivery_distance_km,estimated_minutes,customer_name,item_count,ready_at,published_at,created_at')
    .eq('store_id', store.id)
    .in('status', [...queueStatuses])
    .is('assigned_courier_id', null)
    .order('created_at', { ascending: true })
    .limit(50)

  const { data: networkRows } = await supabase
    .from('courier_store_networks')
    .select('courier_id')
    .eq('store_id', store.id)
    .eq('status', 'connected')

  const courierIds = (networkRows ?? []).map(item => item.courier_id)

  const { data: courierRows } = courierIds.length
    ? await supabase
        .from('couriers')
        .select('id,vehicle_type,is_online,is_available,rating,current_latitude,current_longitude,last_location_at')
        .in('id', courierIds)
        .order('is_online', { ascending: false })
    : { data: [] as any[] }

  const { data: profileRows } = courierIds.length
    ? await supabase
        .from('profiles')
        .select('id,full_name,avatar_url')
        .in('id', courierIds)
    : { data: [] as any[] }

  const profiles = new Map((profileRows ?? []).map(item => [item.id,item]))

  const deliveries: DispatchDelivery[] = (deliveryRows ?? []).map(item => ({
    id: item.id,
    orderCode: item.external_order_id || item.id.replaceAll('-','').slice(0,7).toUpperCase(),
    status: item.status,
    customerName: item.customer_name || 'Cliente',
    deliveryAddress: item.delivery_address,
    deliveryLatitude: item.delivery_latitude == null ? null : Number(item.delivery_latitude),
    deliveryLongitude: item.delivery_longitude == null ? null : Number(item.delivery_longitude),
    deliveryFee: Number(item.delivery_fee ?? 0),
    deliveryDistanceKm: item.delivery_distance_km == null ? null : Number(item.delivery_distance_km),
    estimatedMinutes: item.estimated_minutes == null ? null : Number(item.estimated_minutes),
    itemCount: Number(item.item_count ?? 1),
    readyAt: item.ready_at,
    publishedAt: item.published_at,
    createdAt: item.created_at,
  }))

  const couriers: DispatchCourier[] = (courierRows ?? []).map(item => ({
    id: item.id,
    fullName: profiles.get(item.id)?.full_name || 'Entregador parceiro',
    avatarUrl: profiles.get(item.id)?.avatar_url || null,
    vehicleType: item.vehicle_type,
    isOnline: Boolean(item.is_online),
    isAvailable: Boolean(item.is_available),
    rating: Number(item.rating ?? 0),
    currentLatitude: item.current_latitude == null ? null : Number(item.current_latitude),
    currentLongitude: item.current_longitude == null ? null : Number(item.current_longitude),
    lastLocationAt: item.last_location_at,
  }))

  return (
    <SmartDispatchBoard
      storeName={store.name}
      storeLatitude={store.latitude == null ? null : Number(store.latitude)}
      storeLongitude={store.longitude == null ? null : Number(store.longitude)}
      initialDeliveries={deliveries}
      initialCouriers={couriers}
    />
  )
}
