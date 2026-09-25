import { timingSafeEqual } from 'node:crypto'
import { validateDeliveryInput } from './validate-delivery.mjs'
import {
  createAvailableDelivery,
  InsufficientWalletBalanceError,
  StoreUnavailableError,
} from './delivery-service.mjs'
import { pingDatabase } from './db.mjs'

function json(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.byteLength,
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(data)
}

function secureEqual(a, b) {
  const left = Buffer.from(a ?? '')
  const right = Buffer.from(b ?? '')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

async function readJson(req, limitBytes) {
  let bytes = 0
  const chunks = []
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limitBytes) {
      const error = new Error('payload_too_large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('invalid_json')
    error.statusCode = 400
    throw error
  }
}

function requireInternalKey(req, config) {
  const key = req.headers['x-chama-internal-key']
  if (typeof key !== 'string' || !secureEqual(key, config.internalApiKey)) {
    const error = new Error('unauthorized')
    error.statusCode = 401
    throw error
  }
}

export function createRequestHandler({ config, pool }) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      if (req.method === 'GET' && url.pathname === '/health') {
        const ok = await pingDatabase(pool)
        return json(res, ok ? 200 : 503, {
          status: ok ? 'ok' : 'degraded',
          service: 'chamaentrega-api',
          mysql: ok ? 'connected' : 'unavailable',
          timestamp: new Date().toISOString(),
        })
      }

      if (req.method === 'POST' && url.pathname === '/v1/internal/deliveries') {
        requireInternalKey(req, config)
        const idempotencyKey = req.headers['idempotency-key']
        if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.length > 200) {
          return json(res, 400, { error: 'invalid_idempotency_key' })
        }
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const input = validateDeliveryInput(payload)
        const result = await createAvailableDelivery(pool, input, idempotencyKey.trim())
        return json(res, result.replayed ? 200 : 201, result)
      }

      return json(res, 404, { error: 'not_found' })
    } catch (error) {
      if (error instanceof InsufficientWalletBalanceError) {
        return json(res, 409, {
          error: error.message,
          available: Number(error.available.toFixed(2)),
          required: Number(error.required.toFixed(2)),
        })
      }
      if (error instanceof StoreUnavailableError) {
        return json(res, 409, { error: error.message })
      }
      if (error?.name === 'IdempotencyConflictError') {
        return json(res, 409, { error: error.message })
      }
      if (error?.statusCode) {
        return json(res, error.statusCode, { error: error.message })
      }
      if (['invalid_payload','required_text','text_too_long','required_number','invalid_number','invalid_integer','invalid_payment_method'].includes(error?.message)) {
        return json(res, 400, { error: error.message })
      }
      console.error('[chamaentrega-api]', error)
      return json(res, 500, { error: 'internal_error' })
    }
  }
}
