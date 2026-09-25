import mysql from 'mysql2/promise'
import { getMysqlConnectionSettings } from '@/lib/database/mysql-config'

let pool: mysql.Pool | null = null

export function getMysqlPool(): mysql.Pool {
  if (pool) return pool

  const settings = getMysqlConnectionSettings()
  if (!settings) {
    throw new Error(
      'MYSQL_DATABASE_URL ausente ou inválida. Configure uma URL mysql:// antes de usar DATABASE_PROVIDER=mysql.',
    )
  }

  pool = mysql.createPool({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: settings.database,
    ssl: settings.ssl ? {} : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    decimalNumbers: true,
    dateStrings: true,
    timezone: 'Z',
  })

  return pool
}

export async function mysqlHealthcheck(): Promise<boolean> {
  const currentPool = getMysqlPool()
  await currentPool.query('SELECT 1')
  return true
}
