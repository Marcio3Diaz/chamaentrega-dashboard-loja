import mysql from 'mysql2/promise'

const mysqlUrl = process.env.MYSQL_DATABASE_URL?.trim() || process.env.MYSQL_URL?.trim()
if (!mysqlUrl) throw new Error('MYSQL_URL não configurada.')

const url = new URL(mysqlUrl)
const db = await mysql.createConnection({
  host:url.hostname,
  port:Number(url.port || 3306),
  user:decodeURIComponent(url.username),
  password:decodeURIComponent(url.password),
  database:url.pathname.replace(/^\//,''),
  decimalNumbers:true,
  dateStrings:true,
  timezone:'Z',
})

try {
  const [[seed]] = await db.query(
    `SELECT s.id AS store_id, s.owner_id
     FROM stores s
     ORDER BY s.is_active DESC, s.created_at ASC
     LIMIT 1`
  )
  if (!seed) throw new Error('Nenhuma loja disponível para smoke test.')

  const storeId = seed.store_id
  const userId = seed.owner_id

  const [stores] = await db.execute(
    `SELECT DISTINCT
      s.id,s.owner_id,s.name,s.phone,s.logo_url,s.address,s.latitude,s.longitude,
      s.is_active,s.moderation_status,s.moderation_reason,s.city,s.state,s.created_at
     FROM stores s
     LEFT JOIN store_members sm
       ON sm.store_id=s.id
      AND sm.user_id=?
      AND sm.status='active'
     WHERE s.owner_id=? OR sm.user_id IS NOT NULL
     ORDER BY s.is_active DESC,s.created_at ASC`,
    [userId,userId]
  )

  const [deliveries] = await db.execute(
    `SELECT * FROM deliveries
     WHERE store_id=?
     ORDER BY created_at DESC
     LIMIT 100`,
    [storeId]
  )

  const since = new Date(Date.now() - 7*86400000).toISOString().slice(0,19).replace('T',' ')
  const [weekDeliveries] = await db.execute(
    `SELECT * FROM deliveries
     WHERE store_id=? AND created_at>=?
     ORDER BY created_at DESC
     LIMIT 2000`,
    [storeId,since]
  )

  const [orders] = await db.execute(
    `SELECT
      id,store_id,source,external_order_id,status,fulfillment_type,
      customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,
      items,order_total,payment_method,payment_status,customer_note,delivery_id,
      source_metadata,received_at,created_at,updated_at
     FROM store_orders
     WHERE store_id=?
     ORDER BY received_at DESC
     LIMIT 250`,
    [storeId]
  )

  const [couriers] = await db.query(
    `SELECT id,vehicle_type,is_online,is_available FROM couriers`
  )

  const courierIds = [...new Set(deliveries.map(r=>r.assigned_courier_id).filter(Boolean))]
  let profiles=[]
  if (courierIds.length) {
    const marks=courierIds.map(()=>'?').join(',')
    ;[profiles] = await db.execute(
      `SELECT id,full_name,avatar_url FROM profiles WHERE id IN (${marks})`,
      courierIds
    )
  }

  const checks = {
    storeSelection: stores.length > 0,
    deliveriesQuery: Array.isArray(deliveries),
    weekQuery: Array.isArray(weekDeliveries),
    ordersQuery: Array.isArray(orders),
    couriersQuery: Array.isArray(couriers),
    courierProfilesQuery: Array.isArray(profiles),
  }

  if (Object.values(checks).some(v=>!v)) {
    throw new Error('Falha em uma ou mais consultas operacionais: '+JSON.stringify(checks))
  }

  console.log('MYSQL_DASHBOARD_SMOKE_OK')
  console.log(JSON.stringify({
    storeId,
    stores:stores.length,
    deliveries:deliveries.length,
    weekDeliveries:weekDeliveries.length,
    orders:orders.length,
    couriers:couriers.length,
    assignedCourierProfiles:profiles.length,
  }))
} finally {
  await db.end()
}
