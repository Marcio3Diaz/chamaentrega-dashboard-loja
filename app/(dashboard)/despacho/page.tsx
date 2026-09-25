import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SmartDispatchBoard, type DispatchCourier, type DispatchDelivery } from '@/components/smart-dispatch-board'
import { migrationStoreCouriersWithFallback, migrationStoreDeliveriesWithFallback } from '@/lib/migration-api'
import type { Delivery } from '@/lib/types'

const queueStatuses = ['draft','available','negotiating'] as const

export default async function SmartDispatchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string,string | string[] | undefined>>
}) {
  const params = searchParams ? await searchParams : {}
  const initialFocusDeliveryId = typeof params.delivery === 'string' ? params.delivery : null
  const { store } = await requireStore()
  const supabase = await createClient()

  const { deliveries:deliveryRowsRaw } = await migrationStoreDeliveriesWithFallback(
    store.id,
    async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('store_id', store.id)
        .in('status', [...queueStatuses])
        .is('assigned_courier_id', null)
        .order('created_at', { ascending: true })
        .limit(50)

      if (error) throw error
      return (data ?? []) as Delivery[]
    },
    { limit:150, label:'dispatch-queue' },
  )

  const deliveryRows = deliveryRowsRaw
    .filter(item =>
      queueStatuses.includes(item.status as (typeof queueStatuses)[number])
      && !item.assigned_courier_id
    )
    .sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0,50)

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

      const profiles = new Map((profileRows ?? []).map(item => [item.id,item]))
      return {
        connected:(courierRows ?? []).map(item => ({
          id:item.id,
          fullName:profiles.get(item.id)?.full_name || 'Entregador parceiro',
          phone:profiles.get(item.id)?.phone ?? null,
          avatarUrl:profiles.get(item.id)?.avatar_url ?? null,
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
    { label:'dispatch-couriers' },
  )

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

  const couriers:DispatchCourier[] = courierSnapshot.connected.map(item => ({
    id:item.id,
    fullName:item.fullName,
    avatarUrl:item.avatarUrl,
    vehicleType:item.vehicleType,
    isOnline:item.isOnline,
    isAvailable:item.isAvailable,
    rating:item.rating,
    currentLatitude:item.currentLatitude,
    currentLongitude:item.currentLongitude,
    lastLocationAt:item.lastLocationAt,
  }))

  return (
    <SmartDispatchBoard
      storeName={store.name}
      storeLatitude={store.latitude == null ? null : Number(store.latitude)}
      storeLongitude={store.longitude == null ? null : Number(store.longitude)}
      initialDeliveries={deliveries}
      initialCouriers={couriers}
      initialFocusDeliveryId={initialFocusDeliveryId}
    />
  )
}
