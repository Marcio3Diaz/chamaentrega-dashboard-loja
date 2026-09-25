import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LiveCourierMap, type LiveCourier, type LiveDelivery } from '@/components/live-courier-map'
import { migrationStoreCouriersWithFallback, migrationStoreDeliveriesWithFallback } from '@/lib/migration-api'
import type { Delivery } from '@/lib/types'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

export default async function LiveMapPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string,string | string[] | undefined>>
}) {
  const params = searchParams ? await searchParams : {}
  const initialDeliveryId = typeof params.delivery === 'string' ? params.delivery : null
  const initialCourierId = typeof params.courier === 'string' ? params.courier : null
  const { store } = await requireStore()
  const supabase = await createClient()

  const courierSnapshot = await migrationStoreCouriersWithFallback(
    store.id,
    async () => {
      const { data:networkRows, error:networkError } = await supabase
        .from('courier_store_networks')
        .select('courier_id')
        .eq('store_id', store.id)
        .eq('status', 'connected')

      if (networkError) throw networkError

      const courierIds = (networkRows ?? []).map(item => item.courier_id)
      const [{ data:courierRows, error:courierError }, { data:profileRows, error:profileError }] = await Promise.all([
        courierIds.length
          ? supabase
              .from('couriers')
              .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
              .in('id', courierIds)
              .order('is_online', { ascending:false })
          : Promise.resolve({ data:[] as any[], error:null }),
        courierIds.length
          ? supabase
              .from('profiles')
              .select('id,full_name,phone,avatar_url')
              .in('id', courierIds)
          : Promise.resolve({ data:[] as any[], error:null }),
      ])

      if (courierError) throw courierError
      if (profileError) throw profileError

      const profileMap = new Map((profileRows ?? []).map(item => [item.id,item]))
      return {
        connected:(courierRows ?? []).map(item => ({
          id:item.id,
          fullName:profileMap.get(item.id)?.full_name ?? 'Entregador parceiro',
          phone:profileMap.get(item.id)?.phone ?? null,
          avatarUrl:profileMap.get(item.id)?.avatar_url ?? null,
          vehicleType:item.vehicle_type,
          isOnline:Boolean(item.is_online),
          isAvailable:Boolean(item.is_available),
          rating:Number(item.rating ?? 0),
          totalDeliveries:Number(item.total_deliveries ?? 0),
          currentLatitude:item.current_latitude == null ? null : Number(item.current_latitude),
          currentLongitude:item.current_longitude == null ? null : Number(item.current_longitude),
          lastLocationAt:item.last_location_at,
          connectedAt:null,
          activeDelivery:null,
        })),
        pending:[],
      }
    },
    { label:'live-map-couriers' },
  )

  const couriers:LiveCourier[] = courierSnapshot.connected.map(item => ({
    id:item.id,
    fullName:item.fullName,
    avatarUrl:item.avatarUrl,
    vehicleType:item.vehicleType,
    isOnline:item.isOnline,
    isAvailable:item.isAvailable,
    rating:item.rating,
    totalDeliveries:item.totalDeliveries,
    currentLatitude:item.currentLatitude,
    currentLongitude:item.currentLongitude,
    lastLocationAt:item.lastLocationAt,
  }))

  const { deliveries:deliveryRowsRaw } = await migrationStoreDeliveriesWithFallback(
    store.id,
    async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('store_id', store.id)
        .in('status', activeStatuses)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as Delivery[]
    },
    { limit:250, label:'live-map' },
  )

  const deliveryRows = deliveryRowsRaw
    .filter(item => activeStatuses.includes(item.status))
    .sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const deliveries: LiveDelivery[] = deliveryRows.map(item => ({
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
      initialDeliveryId={initialDeliveryId}
      initialCourierId={initialCourierId}
    />
  )
}
