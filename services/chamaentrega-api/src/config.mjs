function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function flag(name, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw)
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

  const fcmWorkerEnabled = flag('FCM_WORKER_ENABLED', false)
  const realtimeEnabled = flag('REALTIME_ENABLED', false)
  const firebaseServiceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim() || ''
  if (fcmWorkerEnabled && !firebaseServiceAccountBase64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is required when FCM_WORKER_ENABLED=true')
  }

  const realtimeAllowedOrigins = (process.env.REALTIME_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (realtimeEnabled && realtimeAllowedOrigins.length === 0) {
    throw new Error('REALTIME_ALLOWED_ORIGINS is required when REALTIME_ENABLED=true')
  }

  return Object.freeze({
    port: integer('PORT', 3301),
    mysqlUrl,
    internalApiKey,
    mysqlConnectionLimit: integer('MYSQL_CONNECTION_LIMIT', 10),
    requestBodyLimitBytes: integer('REQUEST_BODY_LIMIT_BYTES', 64 * 1024),
    fcmWorkerEnabled,
    firebaseServiceAccountBase64,
    courierAppPackage: process.env.COURIER_APP_PACKAGE?.trim() || 'com.marciodiaz.logistica.entregador',
    outboxPollMs: integer('OUTBOX_POLL_MS', 1500),
    outboxBatchSize: integer('OUTBOX_BATCH_SIZE', 10),
    deliveryMaintenanceEnabled: flag('DELIVERY_MAINTENANCE_ENABLED', false),
    deliveryMaintenancePollMs: integer('DELIVERY_MAINTENANCE_POLL_MS', 5000),
    deliveryMaintenanceBatchSize: integer('DELIVERY_MAINTENANCE_BATCH_SIZE', 100),
    apiSessionTtlSeconds: integer('API_SESSION_TTL_SECONDS', 28800),
    realtimeEnabled,
    realtimeAllowedOrigins,
    realtimePollMs: integer('REALTIME_POLL_MS', 500),
    realtimeBatchSize: integer('REALTIME_BATCH_SIZE', 250),
    realtimeMaxPayloadBytes: integer('REALTIME_MAX_PAYLOAD_BYTES', 32 * 1024),
  })
}
