export type MysqlConnectionSettings = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean
}

export function getMysqlConnectionSettings(): MysqlConnectionSettings | null {
  const raw = process.env.MYSQL_DATABASE_URL?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol !== 'mysql:') return null

    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      ssl: url.searchParams.get('ssl') === 'true',
    }
  } catch {
    return null
  }
}
