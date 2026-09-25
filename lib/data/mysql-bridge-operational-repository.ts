import { createClient } from '@/lib/supabase/server'
import { getMysqlPool } from '@/lib/database/mysql'
import { MysqlOperationalRepository } from '@/lib/data/mysql-operational-repository'
import type {
  StoreOrderRecord,
  CourierOperationalRecord,
  CourierProfileRecord,
} from '@/lib/data/operational-repository'
import type { Delivery } from '@/lib/types'

const DELIVERY_COLUMNS = [
  'id','store_id','assigned_courier_id','external_order_id','status',
  'pickup_address','pickup_latitude','pickup_longitude',
  'delivery_address','delivery_latitude','delivery_longitude',
  'delivery_fee','pickup_distance_km','delivery_distance_km','estimated_minutes',
  'payment_method','order_total','customer_name','customer_phone','customer_note',
  'item_count','package_weight_kg','seconds_to_accept','published_at','expires_at',
  'accepted_at','completed_at','created_at','updated_at','courier_batch_id',
  'ready_at','target_courier_id','dispatch_route_group_id',
] as const

const ORDER_COLUMNS = [
  'id','store_id','source','external_order_id','status','fulfillment_type',
  'customer_name','customer_phone','delivery_address','delivery_latitude',
  'delivery_longitude','items','order_total','payment_method','payment_status',
  'customer_note','delivery_id','source_metadata','received_at','created_at','updated_at',
] as const

const PROFILE_COLUMNS = [
  'id','full_name','phone','avatar_url','role','created_at','updated_at',
] as const

const COURIER_COLUMNS = [
  'id','vehicle_type','is_online','is_available','rating','total_deliveries',
  'current_latitude','current_longitude','last_location_at','moderation_status',
  'moderation_reason','moderated_at','moderated_by','approved_at','created_at','updated_at',
] as const

const STORE_COLUMNS = [
  'id','owner_id','name','phone','logo_url','address','latitude','longitude',
  'is_active','moderation_status','moderation_reason','city','state','zip_code',
  'street','street_number','complement','neighborhood','organization_id',
  'moderated_at','moderated_by','approved_at','created_at','updated_at',
] as const

const STORE_MEMBER_COLUMNS = [
  'store_id','user_id','status','role','created_at','updated_at',
] as const

function normalizeMysqlValue(value: unknown) {
  if (value == null) return null
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0,23).replace('T',' ')
    }
  }
  return value
}

async function upsertRows(
  table:string,
  columns:readonly string[],
  rows:Record<string,unknown>[],
  conflictColumns:string[] = ['id'],
) {
  if (!rows.length) return

  const pool = getMysqlPool()
  const quoted = columns.map(column => `\`${column}\``).join(',')
  const placeholders = '(' + columns.map(() => '?').join(',') + ')'
  const updateColumns = columns.filter(column => !conflictColumns.includes(column))
  const updateSql = updateColumns.length
    ? ' ON DUPLICATE KEY UPDATE ' + updateColumns
      .map(column => `\`${column}\`=VALUES(\`${column}\`)`)
      .join(',')
    : ''

  for (const row of rows) {
    const values = columns.map(column => normalizeMysqlValue(row[column]))
    await pool.query(
      `INSERT INTO \`${table}\` (${quoted}) VALUES ${placeholders}${updateSql}`,
      values,
    )
  }
}

async function syncStoresForUser(userId:string) {
  const supabase = await createClient()

  const [{ data:userProfiles,error:profileError },{ data:owned,error:ownedError },{ data:memberships,error:memberError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS.join(','))
        .eq('id',userId),
      supabase
        .from('stores')
        .select(STORE_COLUMNS.join(','))
        .eq('owner_id',userId),
      supabase
        .from('store_members')
        .select(STORE_MEMBER_COLUMNS.join(','))
        .eq('user_id',userId)
        .eq('status','active'),
    ])

  if (profileError) throw profileError
  if (ownedError) throw ownedError
  if (memberError) throw memberError

  const memberStoreIds = (memberships ?? [])
    .map((row:any) => String(row.store_id ?? ''))
    .filter(Boolean)

  const { data:memberStores,error:memberStoresError } = memberStoreIds.length
    ? await supabase
        .from('stores')
        .select(STORE_COLUMNS.join(','))
        .in('id',memberStoreIds)
    : { data:[], error:null }

  if (memberStoresError) throw memberStoresError

  const storeRows = [
    ...((owned ?? []) as unknown as Record<string,unknown>[]),
    ...((memberStores ?? []) as unknown as Record<string,unknown>[]),
  ]

  const ownerIds = Array.from(new Set(
    storeRows
      .map(row => String(row.owner_id ?? ''))
      .filter(Boolean),
  ))

  const missingOwnerIds = ownerIds.filter(id => id !== userId)
  let ownerProfiles:Record<string,unknown>[] = []

  if (missingOwnerIds.length) {
    const { data,error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS.join(','))
      .in('id',missingOwnerIds)

    if (error) throw error
    ownerProfiles = (data ?? []) as unknown as Record<string,unknown>[]
  }

  await upsertRows(
    'profiles',
    PROFILE_COLUMNS,
    [
      ...((userProfiles ?? []) as unknown as Record<string,unknown>[]),
      ...ownerProfiles,
    ],
  )
  await upsertRows('stores',STORE_COLUMNS,storeRows)
  await upsertRows(
    'store_members',
    STORE_MEMBER_COLUMNS,
    (memberships ?? []) as unknown as Record<string,unknown>[],
    ['store_id','user_id'],
  )
}

async function syncCourierDependencies(courierIds:string[]) {
  const ids = Array.from(new Set(courierIds.filter(Boolean)))
  if (!ids.length) return

  const supabase = await createClient()

  const [{ data:profiles,error:profilesError },{ data:couriers,error:couriersError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS.join(','))
        .in('id',ids),
      supabase
        .from('couriers')
        .select(COURIER_COLUMNS.join(','))
        .in('id',ids),
    ])

  if (profilesError) throw profilesError
  if (couriersError) throw couriersError

  await upsertRows('profiles',PROFILE_COLUMNS,(profiles ?? []) as unknown as Record<string,unknown>[])
  await upsertRows('couriers',COURIER_COLUMNS,(couriers ?? []) as unknown as Record<string,unknown>[])
}

async function syncDeliveries(storeId:string, sinceIso?:string, limit=2000) {
  const supabase = await createClient()

  let query = supabase
    .from('deliveries')
    .select(DELIVERY_COLUMNS.join(','))
    .eq('store_id',storeId)
    .order('created_at',{ ascending:false })
    .limit(limit)

  if (sinceIso) query = query.gte('created_at',sinceIso)

  const { data,error } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as Record<string,unknown>[]
  const courierIds = rows
    .map(row => String(row.assigned_courier_id ?? ''))
    .filter(Boolean)

  await syncCourierDependencies(courierIds)
  await upsertRows('deliveries',DELIVERY_COLUMNS,rows)
}

async function syncOrders(storeId:string, limit=2000) {
  const supabase = await createClient()
  const { data,error } = await supabase
    .from('store_orders')
    .select(ORDER_COLUMNS.join(','))
    .eq('store_id',storeId)
    .order('received_at',{ ascending:false })
    .limit(limit)

  if (error) throw error

  const rows = (data ?? []) as unknown as Record<string,unknown>[]
  const deliveryIds = rows
    .map(row => String(row.delivery_id ?? ''))
    .filter(Boolean)

  if (deliveryIds.length) {
    const { data:deliveries,error:deliveriesError } = await supabase
      .from('deliveries')
      .select(DELIVERY_COLUMNS.join(','))
      .in('id',deliveryIds)

    if (deliveriesError) throw deliveriesError

    const deliveryRows = (deliveries ?? []) as unknown as Record<string,unknown>[]
    const courierIds = deliveryRows
      .map(row => String(row.assigned_courier_id ?? ''))
      .filter(Boolean)

    await syncCourierDependencies(courierIds)
    await upsertRows('deliveries',DELIVERY_COLUMNS,deliveryRows)
  }

  await upsertRows('store_orders',ORDER_COLUMNS,rows)
}

async function syncAllCouriers() {
  const supabase = await createClient()
  const { data:couriers,error } = await supabase
    .from('couriers')
    .select(COURIER_COLUMNS.join(','))

  if (error) throw error

  const rows = (couriers ?? []) as unknown as Record<string,unknown>[]
  const ids = rows.map(row => String(row.id ?? '')).filter(Boolean)

  if (ids.length) {
    const { data:profiles,error:profilesError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS.join(','))
      .in('id',ids)

    if (profilesError) throw profilesError
    await upsertRows('profiles',PROFILE_COLUMNS,(profiles ?? []) as unknown as Record<string,unknown>[])
  }

  await upsertRows('couriers',COURIER_COLUMNS,rows)
}

export class MysqlBridgeOperationalRepository extends MysqlOperationalRepository {
  async listStoresForUser(userId:string) {
    await syncStoresForUser(userId)
    return super.listStoresForUser(userId)
  }

  async listDeliveriesByStore(storeId:string,limit=100):Promise<Delivery[]> {
    await syncDeliveries(storeId,undefined,Math.max(limit,500))
    return super.listDeliveriesByStore(storeId,limit)
  }

  async listDeliveriesSince(storeId:string,sinceIso:string,limit=500):Promise<Delivery[]> {
    await syncDeliveries(storeId,sinceIso,Math.max(limit,500))
    return super.listDeliveriesSince(storeId,sinceIso,limit)
  }

  async listStoreOrders(storeId:string,limit=250):Promise<StoreOrderRecord[]> {
    await syncOrders(storeId,Math.max(limit,500))
    return super.listStoreOrders(storeId,limit)
  }

  async listCouriers():Promise<CourierOperationalRecord[]> {
    await syncAllCouriers()
    return super.listCouriers()
  }

  async listCourierProfilesByIds(ids:string[]):Promise<CourierProfileRecord[]> {
    await syncCourierDependencies(ids)
    return super.listCourierProfilesByIds(ids)
  }
}
