import { timingSafeEqual } from 'node:crypto'
import { validateDeliveryInput } from './validate-delivery.mjs'
import {
  createAvailableDelivery,
  InsufficientWalletBalanceError,
  StoreUnavailableError,
} from './delivery-service.mjs'
import { pingDatabase } from './db.mjs'
import { CourierNetworkError, reviewCourierNetworkRequest } from './courier-network-service.mjs'
import { ApiSessionError, authenticateApiSession, createApiSession, revokeApiSession } from './auth-service.mjs'
import { DeliveryQueryError, getDelivery, listCourierActiveDeliveries, listStoreLiveDeliveries } from './delivery-query-service.mjs'
import {
  DeliveryCommandError,
  acceptDelivery,
  rejectDelivery,
  advanceDeliveryStatus,
  cancelDelivery,
  recordDeliveryLocation,
  dispatchRouteToCourier,
} from './delivery-command-service.mjs'

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

function bearerToken(req) {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
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

      const deliveryReadMatch = url.pathname.match(/^\/v1\/internal\/deliveries\/([0-9a-f-]{36})$/i)
      if (req.method === 'GET' && deliveryReadMatch) {
        requireInternalKey(req, config)
        return json(res, 200, await getDelivery(pool, deliveryReadMatch[1]))
      }

      const courierActiveMatch = url.pathname.match(/^\/v1\/internal\/couriers\/([0-9a-f-]{36})\/active-deliveries$/i)
      if (req.method === 'GET' && courierActiveMatch) {
        requireInternalKey(req, config)
        return json(res, 200, await listCourierActiveDeliveries(pool, courierActiveMatch[1]))
      }

      const storeLiveMatch = url.pathname.match(/^\/v1\/internal\/stores\/([0-9a-f-]{36})\/live-deliveries$/i)
      if (req.method === 'GET' && storeLiveMatch) {
        requireInternalKey(req, config)
        return json(res, 200, await listStoreLiveDeliveries(pool, storeLiveMatch[1], url.searchParams.get('limit')))
      }

      if (req.method === 'POST' && url.pathname === '/v1/internal/auth/sessions') {
        requireInternalKey(req, config)
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const result = await createApiSession(pool, payload, payload.ttlSeconds ?? config.apiSessionTtlSeconds)
        return json(res, 201, result)
      }

      if (req.method === 'POST' && url.pathname === '/v1/internal/auth/sessions/revoke') {
        requireInternalKey(req, config)
        const payload = await readJson(req, config.requestBodyLimitBytes)
        return json(res, 200, await revokeApiSession(pool, payload.sessionId, payload.subjectId ?? null))
      }

      if (req.method === 'GET' && url.pathname === '/v1/session') {
        const token = bearerToken(req)
        if (!token) return json(res, 401, { error:'authorization_required' })
        const session = await authenticateApiSession(pool, token)
        return json(res, 200, {
          session:{
            id:session.id,
            subjectId:session.subjectId,
            subjectRole:session.subjectRole,
            scopes:session.scopes,
          },
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

      const commandMatch = url.pathname.match(/^\/v1\/internal\/deliveries\/([0-9a-f-]{36})\/(accept|reject|status|cancel|location)$/i)
      if (req.method === 'POST' && commandMatch) {
        requireInternalKey(req, config)
        const [, deliveryId, command] = commandMatch
        const payload = await readJson(req, config.requestBodyLimitBytes)

        if (command === 'accept') {
          return json(res, 200, await acceptDelivery(pool, deliveryId, payload.courierId))
        }
        if (command === 'reject') {
          return json(res, 200, await rejectDelivery(pool, deliveryId, payload.courierId, payload.reason))
        }
        if (command === 'status') {
          return json(res, 200, await advanceDeliveryStatus(pool, deliveryId, payload.courierId, payload.status))
        }
        if (command === 'cancel') {
          return json(res, 200, await cancelDelivery(pool, deliveryId, payload.storeId, payload.reason))
        }
        if (command === 'location') {
          return json(res, 200, await recordDeliveryLocation(
            pool,
            deliveryId,
            payload.courierId,
            payload.latitude,
            payload.longitude,
            payload.accuracyMeters,
          ))
        }
      }

      if (req.method === 'POST' && url.pathname === '/v1/internal/courier-network/review') {
        requireInternalKey(req, config)
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const result = await reviewCourierNetworkRequest(
          pool,
          payload.storeId,
          payload.courierId,
          payload.reviewerId,
          payload.decision,
          payload.note,
        )
        return json(res, 200, result)
      }

      if (req.method === 'POST' && url.pathname === '/v1/internal/dispatch-route') {
        requireInternalKey(req, config)
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const result = await dispatchRouteToCourier(
          pool,
          payload.storeId,
          payload.courierId,
          payload.deliveryIds,
        )
        return json(res, 200, result)
      }

      return json(res, 404, { error: 'not_found' })
    } catch (error) {
      if (error instanceof ApiSessionError) {
        return json(res, error.statusCode || 401, { error:error.message })
      }
      if (error instanceof DeliveryQueryError) {
        return json(res, error.statusCode || 400, { error:error.message })
      }
      if (error instanceof CourierNetworkError) {
        return json(res, error.statusCode || 409, { error:error.message })
      }
      if (error instanceof DeliveryCommandError) {
        return json(res, error.statusCode || 409, {
          error: error.message,
          ...(error.details || {}),
        })
      }
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
