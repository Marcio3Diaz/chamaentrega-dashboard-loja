import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'

const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const mysqlUrl = process.env.MYSQL_DATABASE_URL?.trim()

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL não configurada.')
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.')
if (mode === 'apply' && !mysqlUrl) throw new Error('MYSQL_DATABASE_URL não configurada.')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TABLES = [
  {
    name: 'profiles',
    select: 'id,full_name,avatar_url,role',
    columns: ['id','full_name','avatar_url','role'],
  },
  {
    name: 'stores',
    select: 'id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,moderation_status,moderation_reason,city,state,created_at,updated_at',
    columns: ['id','owner_id','name','phone','logo_url','address','latitude','longitude','is_active','moderation_status','moderation_reason','city','state','created_at','updated_at'],
  },
  {
    name: 'store_members',
    select: 'store_id,user_id,role,status,created_at,updated_at',
    columns: ['store_id','user_id','role','status','created_at','updated_at'],
  },
  {
    name: 'couriers',
    select: 'id,vehicle_type,is_online,is_available',
    columns: ['id','vehicle_type','is_online','is_available'],
  },
  {
    name: 'deliveries',
    select: 'id,store_id,assigned_courier_id,external_order_id,status,pickup_address,delivery_address,pickup_latitude,pickup_longitude,delivery_latitude,delivery_longitude,delivery_fee,pickup_distance_km,delivery_distance_km,estimated_minutes,payment_method,order_total,customer_name,customer_phone,customer_note,item_count,package_weight_kg,ready_at,accepted_at,completed_at,created_at,updated_at',
    columns: ['id','store_id','assigned_courier_id','external_order_id','status','pickup_address','delivery_address','pickup_latitude','pickup_longitude','delivery_latitude','delivery_longitude','delivery_fee','pickup_distance_km','delivery_distance_km','estimated_minutes','payment_method','order_total','customer_name','customer_phone','customer_note','item_count','package_weight_kg','ready_at','accepted_at','completed_at','created_at','updated_at'],
  },
  {
    name: 'store_orders',
    select: 'id,store_id,source,external_order_id,status,fulfillment_type,customer_name,customer_phone,delivery_address,delivery_latitude,delivery_longitude,items,order_total,payment_method,payment_status,customer_note,delivery_id,source_metadata,received_at,created_at,updated_at',
    columns: ['id','store_id','source','external_order_id','status','fulfillment_type','customer_name','customer_phone','delivery_address','delivery_latitude','delivery_longitude','items','order_total','payment_method','payment_status','customer_note','delivery_id','source_metadata','received_at','created_at','updated_at'],
  },
]

function toMysqlDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0,23).replace('T',' ')
}

function normalizeValue(column, value) {
  if (value == null) return null
  if (['created_at','updated_at','ready_at','accepted_at','completed_at','received_at'].includes(column)) {
    return toMysqlDate(value)
  }
  if (column === 'items' || column === 'source_metadata') {
    return JSON.stringify(value ?? (column === 'items' ? [] : {}))
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

async function fetchAll(table) {
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from(table.name)
      .select(table.select)
      .range(from, to)

    if (error) {
      throw new Error(`${table.name}: ${error.message}`)
    }

    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }

  return rows
}

async function openMysql() {
  const url = new URL(mysqlUrl)
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//,''),
    ssl: url.searchParams.get('ssl') === 'true' ? {} : undefined,
    timezone: 'Z',
    decimalNumbers: true,
    dateStrings: true,
  })
}

async function upsertTable(connection, table, rows) {
  if (!rows.length) return

  const quoted = table.columns.map(column => `\`${column}\``).join(',')
  const placeholders = table.columns.map(() => '?').join(',')
  const updates = table.columns
    .filter(column => !['id','store_id','user_id'].includes(column))
    .map(column => `\`${column}\`=VALUES(\`${column}\`)`)
    .join(',')

  const sql = `INSERT INTO \`${table.name}\` (${quoted})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updates}`

  for (const row of rows) {
    const values = table.columns.map(column => normalizeValue(column, row[column]))
    await connection.execute(sql, values)
  }
}

async function main() {
  console.log(`Modo: ${mode}`)
  console.log('Lendo dados do Supabase com service role...')

  const snapshots = new Map()
  for (const table of TABLES) {
    const rows = await fetchAll(table)
    snapshots.set(table.name, rows)
    console.log(`Supabase ${table.name}: ${rows.length}`)
  }

  if (mode !== 'apply') {
    console.log('\nDry-run concluído. Nenhum dado foi gravado no MySQL.')
    console.log('Use: npm run db:migrate:mysql -- --apply')
    return
  }

  const connection = await openMysql()
  try {
    await connection.beginTransaction()

    for (const table of TABLES) {
      const rows = snapshots.get(table.name) ?? []
      console.log(`Migrando ${table.name}: ${rows.length}`)
      await upsertTable(connection, table, rows)
    }

    await connection.commit()
    console.log('\nMigração concluída e commitada no MySQL.')
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    await connection.end()
  }
}

main().catch(error => {
  console.error('\nFalha na migração:', error)
  process.exitCode = 1
})
