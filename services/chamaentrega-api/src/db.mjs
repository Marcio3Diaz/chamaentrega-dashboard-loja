import mysql from 'mysql2/promise'

export function createDatabase(config) {
  const url = new URL(config.mysqlUrl)
  if (url.protocol !== 'mysql:') {
    throw new Error('MYSQL_URL must use mysql://')
  }

  const database = url.pathname.replace(/^\//, '')
  if (!database) throw new Error('MYSQL_URL must include a database name')

  const sslMode = (url.searchParams.get('ssl') ?? '').toLowerCase()
  const ssl = ['1', 'true', 'required'].includes(sslMode)
    ? { rejectUnauthorized: true }
    : undefined

  return mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(database),
    waitForConnections: true,
    connectionLimit: config.mysqlConnectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true,
    ssl,
  })
}

export async function pingDatabase(pool) {
  const [rows] = await pool.query('SELECT 1 AS ok')
  return Array.isArray(rows) && rows[0]?.ok === 1
}
