import fs from 'node:fs/promises'
import mysql from 'mysql2/promise'

const mysqlUrl = process.env.MYSQL_DATABASE_URL?.trim()
if (!mysqlUrl) throw new Error('MYSQL_DATABASE_URL não configurada.')

const url = new URL(mysqlUrl)
const connection = await mysql.createConnection({
  host:url.hostname,
  port:Number(url.port || 3306),
  user:decodeURIComponent(url.username),
  password:decodeURIComponent(url.password),
  database:url.pathname.replace(/^\//,''),
  multipleStatements:true,
  decimalNumbers:true,
  dateStrings:true,
  timezone:'Z',
})

const ids = {
  owner:'11111111-1111-4111-8111-111111111111',
  courier:'22222222-2222-4222-8222-222222222222',
  store:'33333333-3333-4333-8333-333333333333',
  delivery:'44444444-4444-4444-8444-444444444444',
  order:'55555555-5555-4555-8555-555555555555',
}

try {
  const schema = await fs.readFile(new URL('../mysql/001_core.sql', import.meta.url),'utf8')
  await connection.query(schema)

  await connection.beginTransaction()

  await connection.execute(
    `INSERT INTO profiles (id,full_name,role)
     VALUES (?,?,?),(?,?,?)
     ON DUPLICATE KEY UPDATE full_name=VALUES(full_name),role=VALUES(role)`,
    [
      ids.owner,'Loja Teste','store_owner',
      ids.courier,'Entregador Teste','courier',
    ],
  )

  await connection.execute(
    `INSERT INTO stores (
      id,owner_id,name,address,is_active,moderation_status,city,state
    ) VALUES (?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name)`,
    [ids.store,ids.owner,'ChamaEntrega Teste','Rua de Teste, 100',1,'active','Rio de Janeiro','RJ'],
  )

  await connection.execute(
    `INSERT INTO store_members (store_id,user_id,role,status)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE role=VALUES(role),status=VALUES(status)`,
    [ids.store,ids.owner,'owner','active'],
  )

  await connection.execute(
    `INSERT INTO couriers (id,vehicle_type,is_online,is_available)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE vehicle_type=VALUES(vehicle_type),is_online=VALUES(is_online),is_available=VALUES(is_available)`,
    [ids.courier,'motorcycle',1,1],
  )

  await connection.execute(
    `INSERT INTO deliveries (
      id,store_id,assigned_courier_id,status,pickup_address,delivery_address,
      delivery_fee,payment_method,order_total,customer_name,customer_phone,item_count
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE status=VALUES(status),assigned_courier_id=VALUES(assigned_courier_id)`,
    [
      ids.delivery,ids.store,ids.courier,'accepted',
      'Rua de Teste, 100','Rua do Cliente, 200',
      9.9,'pix',59.9,'Cliente Teste','21999999999',2,
    ],
  )

  await connection.execute(
    `INSERT INTO store_orders (
      id,store_id,source,external_order_id,status,fulfillment_type,
      customer_name,delivery_address,items,order_total,payment_method,
      payment_status,delivery_id,source_metadata
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE status=VALUES(status),delivery_id=VALUES(delivery_id)`,
    [
      ids.order,ids.store,'manual','TESTE-001','in_route','delivery',
      'Cliente Teste','Rua do Cliente, 200',
      JSON.stringify([{name:'Pedido teste',quantity:1}]),
      59.9,'pix','paid',ids.delivery,JSON.stringify({smokeTest:true}),
    ],
  )

  const [stores] = await connection.execute(
    `SELECT s.id,s.name,sm.role
     FROM stores s
     JOIN store_members sm ON sm.store_id=s.id
     WHERE s.id=? AND sm.user_id=?`,
    [ids.store,ids.owner],
  )

  const [deliveries] = await connection.execute(
    `SELECT d.id,d.status,d.delivery_fee,c.vehicle_type
     FROM deliveries d
     LEFT JOIN couriers c ON c.id=d.assigned_courier_id
     WHERE d.id=?`,
    [ids.delivery],
  )

  const [orders] = await connection.execute(
    `SELECT o.id,o.delivery_id,o.items
     FROM store_orders o
     WHERE o.id=?`,
    [ids.order],
  )

  if (stores.length !== 1) throw new Error('Relacionamento store_members falhou.')
  if (deliveries.length !== 1) throw new Error('Consulta de delivery falhou.')
  if (orders.length !== 1) throw new Error('Consulta de store_orders falhou.')
  if (orders[0].delivery_id !== ids.delivery) throw new Error('Vínculo pedido → entrega falhou.')

  console.log('MYSQL_SCHEMA_SMOKE_OK')
  console.log(JSON.stringify({
    store:stores[0],
    delivery:deliveries[0],
    order:{id:orders[0].id,delivery_id:orders[0].delivery_id},
  },null,2))

  await connection.rollback()
} catch (error) {
  try { await connection.rollback() } catch {}
  throw error
} finally {
  await connection.end()
}
