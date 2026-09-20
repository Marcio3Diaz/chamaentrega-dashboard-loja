import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LiveCourierMap, type LiveCourier, type LiveDelivery } from '@/components/live-courier-map'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

export default async function LiveMapPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const { data: courierRows } = await supabase
    .from('couriers')
    .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
    .order('is_online', { ascending: false })

  const courierIds = (courierRows ?? []).map(item => item.id)
  const { data: profileRows } = courierIds.length
    ? await supabase.from('profiles').select('id,full_name,avatar_url').in('id', courierIds)
    : { data: [] as { id:string; full_name:string|null; avatar_url:string|null }[] }

  const profileMap = new Map((profileRows ?? []).map(item => [item.id,item]))

  const couriers: LiveCourier[] = (courierRows ?? []).map(item => ({
    id: item.id,
    fullName: profileMap.get(item.id)?.full_name ?? 'Entregador parceiro',
    avatarUrl: profileMap.get(item.id)?.avatar_url ?? null,
    vehicleType: item.vehicle_type,
    isOnline: Boolean(item.is_online),
    isAvailable: Boolean(item.is_available),
    rating: Number(item.rating ?? 0),
    totalDeliveries: Number(item.total_deliveries ?? 0),
    currentLatitude: item.current_latitude == null ? null : Number(item.current_latitude),
    currentLongitude: item.current_longitude == null ? null : Number(item.current_longitude),
    lastLocationAt: item.last_location_at,
  }))

  const { data: deliveryRows } = await supabase
    .from('deliveries')
    .select('id,assigned_courier_id,status,pickup_address,pickup_latitude,pickup_longitude,delivery_address,delivery_latitude,delivery_longitude,customer_name,delivery_fee,estimated_minutes')
    .eq('store_id', store.id)
    .in('status', activeStatuses)
    .order('updated_at', { ascending: false })

  const deliveries: LiveDelivery[] = (deliveryRows ?? []).map(item => ({
    id: item.id,
    assignedCourierId: item.assigned_courier_id,
    status: item.status,
    pickupAddress: item.pickup_address,
    pickupLatitude: item.pickup_latitude == null ? null : Number(item.pickup_latitude),
    pickupLongitude: item.pickup_longitude == null ? null : Number(item.pickup_longitude),
    deliveryAddress: item.delivery_address,
    deliveryLatitude: item.delivery_latitude == null ? null : Number(item.delivery_latitude),
    deliveryLongitude: item.delivery_longitude == null ? null : Number(item.delivery_longitude),
    customerName: item.customer_name,
    deliveryFee: Number(item.delivery_fee ?? 0),
    estimatedMinutes: item.estimated_minutes == null ? null : Number(item.estimated_minutes),
  }))

  return (
    <LiveCourierMap
      storeId={store.id}
      storeName={store.name}
      storeLatitude={store.latitude == null ? null : Number(store.latitude)}
      storeLongitude={store.longitude == null ? null : Number(store.longitude)}
      initialCouriers={couriers}
      initialDeliveries={deliveries}
    />
  )
}
