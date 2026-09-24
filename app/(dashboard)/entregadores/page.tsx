import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  StoreCouriersPanel,
  type StoreCourier,
  type StoreCourierActiveDelivery,
  type StoreCourierRequest,
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
    .select('id,courier_id,status,requested_at,reviewed_at,created_at,updated_at')
    .eq('store_id', store.id)
    .order('requested_at', { ascending: false })

  const connectedRows = (networkRows ?? []).filter(item => item.status === 'connected')
  const pendingRows = (networkRows ?? []).filter(item => item.status === 'pending')
  const allCourierIds = Array.from(
    new Set((networkRows ?? []).map(item => item.courier_id)),
  )
  const connectedCourierIds = connectedRows.map(item => item.courier_id)

  const { data: courierRows } = allCourierIds.length
    ? await supabase
        .from('couriers')
        .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
        .in('id', allCourierIds)
    : { data: [] as any[] }

  const { data: profileRows } = allCourierIds.length
    ? await supabase
        .from('profiles')
        .select('id,full_name,phone,avatar_url')
        .in('id', allCourierIds)
    : { data: [] as any[] }

  const { data: deliveryRows } = connectedCourierIds.length
    ? await supabase
        .from('deliveries')
        .select('id,assigned_courier_id,status,customer_name,delivery_address,delivery_fee,estimated_minutes,updated_at')
        .eq('store_id', store.id)
        .in('status', activeStatuses)
        .in('assigned_courier_id', connectedCourierIds)
        .order('updated_at', { ascending: false })
    : { data: [] as any[] }

  const networks = new Map(connectedRows.map(item => [item.courier_id,item]))
  const profiles = new Map((profileRows ?? []).map(item => [item.id,item]))
  const courierMap = new Map((courierRows ?? []).map(item => [item.id,item]))
  const activeByCourier = new Map<string,StoreCourierActiveDelivery>()

  for (const delivery of deliveryRows ?? []) {
    if (!delivery.assigned_courier_id || activeByCourier.has(delivery.assigned_courier_id)) continue

    activeByCourier.set(delivery.assigned_courier_id, {
      id: delivery.id,
      status: delivery.status,
      customerName: delivery.customer_name,
      deliveryAddress: delivery.delivery_address,
      deliveryFee: Number(delivery.delivery_fee ?? 0),
      estimatedMinutes: delivery.estimated_minutes == null
        ? null
        : Number(delivery.estimated_minutes),
      updatedAt: delivery.updated_at,
    })
  }

  const couriers: StoreCourier[] = connectedRows
    .map(network => {
      const item = courierMap.get(network.courier_id)
      const profile = profiles.get(network.courier_id)

      if (!item) return null

      return {
        id: item.id,
        fullName: profile?.full_name?.trim() || 'Entregador parceiro',
        phone: profile?.phone ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        vehicleType: item.vehicle_type,
        isOnline: Boolean(item.is_online),
        isAvailable: Boolean(item.is_available),
        rating: Number(item.rating ?? 0),
        totalDeliveries: Number(item.total_deliveries ?? 0),
        currentLatitude: item.current_latitude == null
          ? null
          : Number(item.current_latitude),
        currentLongitude: item.current_longitude == null
          ? null
          : Number(item.current_longitude),
        lastLocationAt: item.last_location_at,
        connectedAt: networks.get(item.id)?.created_at ?? null,
        activeDelivery: activeByCourier.get(item.id) ?? null,
      } satisfies StoreCourier
    })
    .filter((item): item is StoreCourier => item !== null)

  const requests: StoreCourierRequest[] = pendingRows.map(network => {
    const item = courierMap.get(network.courier_id)
    const profile = profiles.get(network.courier_id)

    return {
      courierId: network.courier_id,
      fullName: profile?.full_name?.trim() || 'Entregador parceiro',
      phone: profile?.phone ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      vehicleType: item?.vehicle_type ?? null,
      rating: Number(item?.rating ?? 0),
      totalDeliveries: Number(item?.total_deliveries ?? 0),
      isOnline: Boolean(item?.is_online),
      requestedAt: network.requested_at,
    }
  })

  return (
    <StoreCouriersPanel
      storeId={store.id}
      storeLatitude={store.latitude == null ? null : Number(store.latitude)}
      storeLongitude={store.longitude == null ? null : Number(store.longitude)}
      initialCouriers={couriers}
      initialRequests={requests}
    />
  )
}
