import { createClient } from '@supabase/supabase-js'
import mysql from 'mysql2/promise'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const mysqlUrl = process.env.MYSQL_DATABASE_URL?.trim()

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL não configurada.')
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.')
if (!mysqlUrl) throw new Error('MYSQL_DATABASE_URL não configurada.')

const tables = ['profiles','stores','store_members','couriers','deliveries','store_orders']

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession:false, autoRefreshToken:false },
})

const url = new URL(mysqlUrl)
const connection = await mysql.createConnection({
  host:url.hostname,
  port:Number(url.port || 3306),
  user:decodeURIComponent(url.username),
  password:decodeURIComponent(url.password),
  database:url.pathname.replace(/^\//,''),
  ssl:url.searchParams.get('ssl') === 'true' ? {} : undefined,
})

let hasMismatch = false

try {
  console.log('Tabela'.padEnd(22),'Supabase'.padStart(10),'MySQL'.padStart(10),'Status'.padStart(10))

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count:'exact', head:true })

    if (error) throw new Error(`${table}: ${error.message}`)

    const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``)
    const mysqlCount = Number(rows[0]?.total ?? 0)
    const supabaseCount = Number(count ?? 0)
    const ok = mysqlCount === supabaseCount

    if (!ok) hasMismatch = true

    console.log(
      table.padEnd(22),
      String(supabaseCount).padStart(10),
      String(mysqlCount).padStart(10),
      (ok ? 'OK' : 'DIFERENTE').padStart(10),
    )
  }
} finally {
  await connection.end()
}

if (hasMismatch) {
  console.error('\nForam encontradas diferenças entre Supabase e MySQL.')
  process.exitCode = 2
} else {
  console.log('\nContagens conferem em todas as tabelas migradas.')
}
