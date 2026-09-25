import fs from 'node:fs/promises'
import mysql from 'mysql2/promise'

const mysqlUrl = process.env.MYSQL_DATABASE_URL?.trim() || process.env.MYSQL_URL?.trim()
if (!mysqlUrl) throw new Error('MYSQL_DATABASE_URL ou MYSQL_URL não configurada.')

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

const files = [
  new URL('../mysql/001_core.sql', import.meta.url),
  new URL('../mysql/002_align_store_members.sql', import.meta.url),
  new URL('../mysql/003_align_supabase_core_fields.sql', import.meta.url),
]

try {
  for (const file of files) {
    const sql = await fs.readFile(file,'utf8')
    console.log('Aplicando', file.pathname.split('/').pop())
    await connection.query(sql)
  }

  const [rows] = await connection.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('profiles','stores','store_members','couriers','deliveries','store_orders')
     ORDER BY table_name`
  )

  const names = rows.map(row => row.table_name)
  if (names.length !== 6) {
    throw new Error('Schema incompleto: '+JSON.stringify(names))
  }

  console.log('MYSQL_SCHEMA_APPLIED_OK')
  console.log(names.join(','))
} finally {
  await connection.end()
}
