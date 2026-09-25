import mysql from 'mysql2/promise'

const TABLES = [
  'profiles',
  'organizations',
  'stores',
  'organization_members',
  'store_members',
  'couriers',
  'courier_store_networks',
  'store_wallets',
  'courier_push_tokens',
  'delivery_pricing_settings',
  'platform_billing_settings',
]

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function mysqlOptions(mysqlUrl) {
  const url = new URL(mysqlUrl)
  if (url.protocol !== 'mysql:') throw new Error('MYSQL_URL must use mysql://')
  const database = url.pathname.replace(/^\//, '')
  if (!database) throw new Error('MYSQL_URL must include a database name')
  const sslMode = (url.searchParams.get('ssl') || '').toLowerCase()
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(database),
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true,
    ssl: ['1', 'true', 'required'].includes(sslMode) ? { rejectUnauthorized: true } : undefined,
  }
}

function mysqlDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date from source: ${value}`)
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23)
}

function adaptValue(value, mysqlType) {
  if (value === null || value === undefined) return null
  const type = String(mysqlType || '').toLowerCase()
  if (type.startsWith('json')) return typeof value === 'string' ? value : JSON.stringify(value)
  if (type.startsWith('datetime') || type.startsWith('timestamp')) return mysqlDate(value)
  if (type.startsWith('tinyint(1)') || type === 'boolean') return value ? 1 : 0
  return value
}

async function fetchTable({ baseUrl, serviceKey, table, pageSize = 500 }) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`/rest/v1/${encodeURIComponent(table)}`, baseUrl)
    url.searchParams.set('select', '*')
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(offset))
    const headers = {
      apikey: serviceKey,
      Accept: 'application/json',
    }
    if (serviceKey.split('.').length === 3) {
      headers.Authorization = `Bearer ${serviceKey}`
    }
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Supabase ${table} fetch failed (${response.status}): ${text.slice(0, 500)}`)
    const page = JSON.parse(text)
    if (!Array.isArray(page)) throw new Error(`Unexpected Supabase response for ${table}`)
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

async function assertSafeTarget(connection) {
  const [rows] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM profiles) AS profiles,
       (SELECT COUNT(*) FROM stores) AS stores,
       (SELECT COUNT(*) FROM couriers) AS couriers,
       (SELECT COUNT(*) FROM store_wallets) AS wallets`,
  )
  const counts = rows[0] || {}
  const nonEmpty = Object.entries(counts).filter(([, value]) => Number(value) > 0)
  if (nonEmpty.length && process.env.MIGRATION_BOOTSTRAP_ALLOW_NONEMPTY !== 'true') {
    throw new Error(`Target MySQL is not empty (${nonEmpty.map(([k,v]) => `${k}=${v}`).join(', ')}). Set MIGRATION_BOOTSTRAP_ALLOW_NONEMPTY=true only after reviewing the target.`)
  }
}

async function upsertRows(connection, table, rows) {
  if (!rows.length) return 0
  const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``)
  const typeByColumn = new Map(columns.map(column => [column.Field, column.Type]))
  const allowed = columns.map(column => column.Field)
  let written = 0

  for (const row of rows) {
    const names = allowed.filter(name => Object.prototype.hasOwnProperty.call(row, name))
    if (!names.length) continue
    const values = names.map(name => adaptValue(row[name], typeByColumn.get(name)))
    const insertColumns = names.map(name => `\`${name}\``).join(', ')
    const placeholders = names.map(() => '?').join(', ')
    const updates = names.map(name => `\`${name}\`=VALUES(\`${name}\`)`).join(', ')
    await connection.execute(
      `INSERT INTO \`${table}\` (${insertColumns}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      values,
    )
    written += 1
  }
  return written
}

async function main() {
  if (process.env.MIGRATION_BOOTSTRAP_CONFIRM !== 'COPY_OPERATIONAL_BASELINE') {
    throw new Error('Set MIGRATION_BOOTSTRAP_CONFIRM=COPY_OPERATIONAL_BASELINE to enable writes to MySQL')
  }

  const mysqlUrl = required('MYSQL_URL')
  const baseUrl = required('SUPABASE_SOURCE_URL')
  const serviceKey =
    process.env.SUPABASE_SOURCE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SOURCE_SERVICE_ROLE_KEY?.trim()
  if (!serviceKey) {
    throw new Error('Set SUPABASE_SOURCE_SECRET_KEY or SUPABASE_SOURCE_SERVICE_ROLE_KEY')
  }
  const connection = await mysql.createConnection(mysqlOptions(mysqlUrl))

  try {
    await assertSafeTarget(connection)
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    const summary = []
    for (const table of TABLES) {
      const rows = await fetchTable({ baseUrl, serviceKey, table })
      const written = await upsertRows(connection, table, rows)
      summary.push({ table, sourceRows: rows.length, written })
      console.log(`[bootstrap] ${table}: ${written}/${rows.length}`)
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log(JSON.stringify({ ok: true, summary }, null, 2))
  } finally {
    try { await connection.query('SET FOREIGN_KEY_CHECKS = 1') } catch {}
    await connection.end()
  }
}

main().catch(error => {
  console.error('[bootstrap] failed:', error)
  process.exit(1)
})
