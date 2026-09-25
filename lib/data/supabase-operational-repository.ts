import { createClient } from '@/lib/supabase/server'
import type { Delivery, Store } from '@/lib/types'
import type {
  OperationalRepository,
  StoreOrderRecord,
  CourierOperationalRecord,
  CourierProfileRecord,
} from '@/lib/data/operational-repository'

export class SupabaseOperationalRepository implements OperationalRepository {
  async listStoresForUser(userId: string): Promise<Store[]> {
    const supabase = await createClient()

    const [{ data: owned, error: ownedError }, { data: memberships, error: memberError }] =
      await Promise.all([
        supabase
          .from('stores')
          .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,moderation_status,moderation_reason,city,state')
          .eq('owner_id', userId),
        supabase
          .from('store_members')
          .select('store_id')
          .eq('user_id', userId)
          .eq('status', 'active'),
      ])

    if (ownedError) throw ownedError
    if (memberError) throw memberError

    const ownedIds = new Set((owned ?? []).map(row => row.id))
    const memberIds = (memberships ?? [])
      .map(row => row.store_id)
      .filter(id => !ownedIds.has(id))

    const { data: memberStores, error: memberStoresError } = memberIds.length
      ? await supabase
          .from('stores')
          .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,moderation_status,moderation_reason,city,state')
          .in('id', memberIds)
      : { data: [], error: null }

    if (memberStoresError) throw memberStoresError

    return [...(owned ?? []), ...(memberStores ?? [])] as Store[]
  }

  async listDeliveriesByStore(storeId: string, limit = 100): Promise<Delivery[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data ?? []) as Delivery[]
  }

  async listDeliveriesSince(storeId: string, sinceIso: string, limit = 500): Promise<Delivery[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('store_id', storeId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data ?? []) as Delivery[]
  }

  async listStoreOrders(storeId: string, limit = 250): Promise<StoreOrderRecord[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('store_orders')
      .select('id,store_id,source,external_order_id,status,fulfillment_type,customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,items,order_total,payment_method,payment_status,customer_note,delivery_id,source_metadata,received_at,created_at,updated_at')
      .eq('store_id', storeId)
      .order('received_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return (data ?? []).map((row:any) => ({
      ...row,
      delivery_latitude: row.delivery_latitude == null ? null : Number(row.delivery_latitude),
      delivery_longitude: row.delivery_longitude == null ? null : Number(row.delivery_longitude),
      items: Array.isArray(row.items) ? row.items : [],
      order_total: Number(row.order_total ?? 0),
      source_metadata: row.source_metadata ?? {},
    })) as StoreOrderRecord[]
  }

  async listCouriers(): Promise<CourierOperationalRecord[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('couriers')
      .select('id,vehicle_type,is_online,is_available')

    if (error) throw error
    return (data ?? []) as CourierOperationalRecord[]
  }

  async listCourierProfilesByIds(ids: string[]): Promise<CourierProfileRecord[]> {
    if (!ids.length) return []

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,avatar_url')
      .in('id', ids)

    if (error) throw error
    return (data ?? []) as CourierProfileRecord[]
  }
}
