import mysql from 'mysql2/promise'

const mysqlUrl = process.env.MYSQL_DATABASE_URL?.trim() || process.env.MYSQL_URL?.trim()
const payloadB64 = process.env.MYSQL_IMPORT_PAYLOAD_B64?.trim()
if (!mysqlUrl) throw new Error('MYSQL_DATABASE_URL ou MYSQL_URL não configurada.')
if (!payloadB64) throw new Error('MYSQL_IMPORT_PAYLOAD_B64 não configurada.')

const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'))
const url = new URL(mysqlUrl)
const connection = await mysql.createConnection({
  host:url.hostname,
  port:Number(url.port || 3306),
  user:decodeURIComponent(url.username),
  password:decodeURIComponent(url.password),
  database:url.pathname.replace(/^\//,''),
  multipleStatements:false,
  decimalNumbers:true,
  dateStrings:true,
  timezone:'Z',
})

const order = ['profiles','stores','store_members','couriers','deliveries','store_orders']
const allowed = new Set(order)

function quoteId(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Identificador inválido: '+value)
  return '\`'+value+'\`'
}

function normalizeValue(value) {
  if (value == null) return null
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}T/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 23).replace('T', ' ')
    }
  }
  return value
}

try {
  await connection.beginTransaction()

  for (const table of order) {
    const block = payload.tables?.[table]
    if (!block) continue
    if (!allowed.has(table)) throw new Error('Tabela não permitida: '+table)
    const columns = block.columns
    const rows = block.rows || []
    if (!Array.isArray(columns) || !columns.length) throw new Error('Colunas inválidas para '+table)
    if (!rows.length) {
      console.log('IMPORT',table,0)
      continue
    }

    const colSql = columns.map(quoteId).join(',')
    const placeholders = '('+columns.map(()=>'?').join(',')+')'
    const updateCols = columns.filter(c => !((table==='store_members') ? ['store_id','user_id'].includes(c) : c==='id'))
    const updateSql = updateCols.length
      ? ' ON DUPLICATE KEY UPDATE '+updateCols.map(c=>quoteId(c)+'=VALUES('+quoteId(c)+')').join(',')
      : ''

    for (const row of rows) {
      const values = columns.map(c => normalizeValue(row[c] ?? null))
      await connection.execute(
        'INSERT INTO '+quoteId(table)+' ('+colSql+') VALUES '+placeholders+updateSql,
        values
      )
    }
    console.log('IMPORT',table,rows.length)
  }

  await connection.commit()

  for (const table of order) {
    const [rows] = await connection.query('SELECT COUNT(*) AS total FROM '+quoteId(table))
    console.log('COUNT',table,Number(rows[0].total))
  }
  console.log('MYSQL_IMPORT_OK')
} catch (error) {
  await connection.rollback()
  throw error
} finally {
  await connection.end()
}
