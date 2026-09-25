export type DatabaseProvider = 'supabase' | 'mysql'

export function getDatabaseProvider(): DatabaseProvider {
  const value = process.env.DATABASE_PROVIDER?.trim().toLowerCase()

  return value === 'mysql' ? 'mysql' : 'supabase'
}

export function mysqlRuntimeInfo() {
  const provider = getDatabaseProvider()
  const configuredUrl = process.env.MYSQL_DATABASE_URL?.trim() || process.env.MYSQL_URL?.trim()

  if (provider !== 'mysql') {
    return {
      enabled: false,
      configured: Boolean(configuredUrl),
      host: null,
      database: null,
    }
  }

  if (!configuredUrl) {
    return {
      enabled: true,
      configured: false,
      host: null,
      database: null,
    }
  }

  try {
    const url = new URL(configuredUrl)

    return {
      enabled: true,
      configured: true,
      host: url.hostname || null,
      database: url.pathname.replace(/^\//, '') || null,
    }
  } catch {
    return {
      enabled: true,
      configured: false,
      host: 'invalid-url',
      database: null,
    }
  }
}
