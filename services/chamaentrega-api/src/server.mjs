import http from 'node:http'
import { loadConfig } from './config.mjs'
import { createDatabase, pingDatabase } from './db.mjs'
import { createRequestHandler } from './http.mjs'

const config = loadConfig()
const pool = createDatabase(config)

try {
  const connected = await pingDatabase(pool)
  if (!connected) throw new Error('MySQL ping returned an unexpected response')
} catch (error) {
  console.error('[chamaentrega-api] MySQL startup check failed:', error)
  process.exit(1)
}

const server = http.createServer(createRequestHandler({ config, pool }))
server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[chamaentrega-api] listening on :${config.port}`)
})

async function shutdown(signal) {
  console.log(`[chamaentrega-api] ${signal}; shutting down`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
