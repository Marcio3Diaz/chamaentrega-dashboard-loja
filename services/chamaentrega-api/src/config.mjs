function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function integer(name, fallback) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid integer environment variable: ${name}`)
  }
  return value
}

export function loadConfig() {
  const mysqlUrl = required('MYSQL_URL')
  const internalApiKey = required('CHAMA_INTERNAL_API_KEY')

  if (internalApiKey.length < 32) {
    throw new Error('CHAMA_INTERNAL_API_KEY must have at least 32 characters')
  }

  return Object.freeze({
    port: integer('PORT', 3301),
    mysqlUrl,
    internalApiKey,
    mysqlConnectionLimit: integer('MYSQL_CONNECTION_LIMIT', 10),
    requestBodyLimitBytes: integer('REQUEST_BODY_LIMIT_BYTES', 64 * 1024),
  })
}
