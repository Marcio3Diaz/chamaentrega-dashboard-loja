import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  StoreCouriersPanel,
  type StoreCourier,
  type StoreCourierActiveDelivery,
} from '@/components/store-couriers-panel'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

export default async function CouriersPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const { data: networkRows } = await supabase
    .from('courier_store_networks')
    .select('courier_id,status,created_at,updated_at')
    .eq('store_id', store.id)
    .eq('status', 'connected')
    .order('created_at', { ascending: true })

  const courierIds = (networkRows ?? []).map(item => item.courier_id)

  const { data: courierRows } = courierIds.length
    ? await supabase
        .from('couriers')
        .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
        .in('id', courierIds)
    : { data: [] as any[] }

  const { data: profileRows } = courierIds.length
    ? await supabase
        .from('profiles')
        .select('id,full_name,avatar_url')
        .in('id', courierIds)
    : { data: [] as any[] }

  const { data: deliveryRows } = courierIds.length
    ? await supabase
        .from('deliveries')
        .select('id,assigned_courier_id,status,customer_name,delivery_address,delivery_fee,estimated_minutes,updated_at')
        .eq('store_id', store.id)
        .in('status', activeStatuses)
        .in('assigned_courier_id', courierIds)
        .order('updated_at', { ascending: false })
    : { data: [] as any[] }

  const networks = new Map((networkRows ?? []).map(item => [item.courier_id,item]))
  const profiles = new Map((profileRows ?? []).map(item => [item.id,item]))
  const activeByCourier = new Map<string,StoreCourierActiveDelivery>()

  for (const delivery of deliveryRows ?? []) {
    if (!delivery.assigned_courier_id || activeByCourier.has(delivery.assigned_courier_id)) continue
    activeByCourier.set(delivery.assigned_courier_id, {
      id: delivery.id,
      status: delivery.status,
      customerName: delivery.customer_name,
      deliveryAddress: delivery.delivery_address,
      deliveryFee: Number(delivery.delivery_fee ?? 0),
      estimatedMinutes: delivery.estimated_minutes == null ? null : Number(delivery.estimated_minutes),
      updatedAt: delivery.updated_at,
    })
  }

  const couriers: StoreCourier[] = (courierRows ?? []).map(item => {
    const network = networks.get(item.id)
    const profile = profiles.get(item.id)

    return {
      id: item.id,
      fullName: profile?.full_name?.trim() || 'Entregador parceiro',
      avatarUrl: profile?.avatar_url ?? null,
      vehicleType: item.vehicle_type,
      isOnline: Boolean(item.is_online),
      isAvailable: Boolean(item.is_available),
      rating: Number(item.rating ?? 0),
      totalDeliveries: Number(item.total_deliveries ?? 0),
      currentLatitude: item.current_latitude == null ? null : Number(item.current_latitude),
      currentLongitude: item.current_longitude == null ? null : Number(item.current_longitude),
      lastLocationAt: item.last_location_at,
      connectedAt: network?.created_at ?? null,
      activeDelivery: activeByCourier.get(item.id) ?? null,
    }
  })

  return (
    <StoreCouriersPanel
      storeId={store.id}
      initialCouriers={couriers}
    />
  )
}
