import { timingSafeEqual } from 'node:crypto'
import { validateDeliveryInput } from './validate-delivery.mjs'
import {
  createAvailableDelivery,
  InsufficientWalletBalanceError,
  StoreUnavailableError,
} from './delivery-service.mjs'
import { pingDatabase } from './db.mjs'
import { CourierNetworkError, reviewCourierNetworkRequest } from './courier-network-service.mjs'
import {
  ApiSessionError,
  authenticateApiSession,
  createApiSession,
  revokeApiSession,
  requireCourierSession,
  requireDeliverySessionAccess,
  requireSessionScope,
  requireStoreSessionAccess,
} from './auth-service.mjs'
import { DeliveryQueryError, getDelivery, listCourierActiveDeliveries, listCourierAvailableOffers, listStoreDeliveries, listStoreLiveDeliveries } from './delivery-query-service.mjs'
import { SupabaseExchangeError, exchangeSupabaseAccessToken } from './supabase-auth-bridge.mjs'
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

const authExchangeRate = new Map()

function enforceAuthExchangeRate(req) {
  const key = req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const windowMs = 60_000
  const current = authExchangeRate.get(key)
  if (!current || now - current.startedAt >= windowMs) {
    authExchangeRate.set(key, { startedAt:now, count:1 })
    return
  }
  current.count += 1
  if (current.count > 20) {
    const error = new Error('auth_exchange_rate_limited')
    error.statusCode = 429
    throw error
  }

  if (authExchangeRate.size > 5000) {
    for (const [entryKey, value] of authExchangeRate) {
      if (now - value.startedAt >= windowMs) authExchangeRate.delete(entryKey)
      if (authExchangeRate.size <= 4000) break
    }
  }
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

async function requireBearerSession(req, pool) {
  const token = bearerToken(req)
  if (!token) throw new ApiSessionError('authorization_required', 401)
  return authenticateApiSession(pool, token)
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

      const publicDeliveryReadMatch = url.pathname.match(/^\/v1\/deliveries\/([0-9a-f-]{36})$/i)
      if (req.method === 'GET' && publicDeliveryReadMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'delivery:read')
        const access = await requireDeliverySessionAccess(pool, session, publicDeliveryReadMatch[1])
        const result = await getDelivery(pool, publicDeliveryReadMatch[1])

        if (
          session.subjectRole === 'courier' &&
          access.assigned_courier_id !== session.subjectId
        ) {
          result.delivery.customerPhone = null
          result.delivery.customerNote = null
        }

        return json(res, 200, result)
      }

      const publicCourierOffersMatch = url.pathname.match(/^\/v1\/couriers\/me\/offers$/i)
      if (req.method === 'GET' && publicCourierOffersMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'delivery:read')
        const courierId = requireCourierSession(session)
        return json(res, 200, await listCourierAvailableOffers(pool, courierId, url.searchParams.get('limit')))
      }

      const publicCourierActiveMatch = url.pathname.match(/^\/v1\/couriers\/me\/active-deliveries$/i)
      if (req.method === 'GET' && publicCourierActiveMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'delivery:read')
        const courierId = requireCourierSession(session)
        return json(res, 200, await listCourierActiveDeliveries(pool, courierId))
      }

      const publicStoreDeliveriesMatch = url.pathname.match(/^\/v1\/stores\/([0-9a-f-]{36})\/deliveries$/i)
      if (req.method === 'GET' && publicStoreDeliveriesMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'store:read')
        const storeId = await requireStoreSessionAccess(pool, session, publicStoreDeliveriesMatch[1])
        return json(res, 200, await listStoreDeliveries(pool, storeId, {
          limit:url.searchParams.get('limit'),
          since:url.searchParams.get('since'),
        }))
      }

      const publicStoreLiveMatch = url.pathname.match(/^\/v1\/stores\/([0-9a-f-]{36})\/live-deliveries$/i)
      if (req.method === 'GET' && publicStoreLiveMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'store:read')
        const storeId = await requireStoreSessionAccess(pool, session, publicStoreLiveMatch[1])
        return json(res, 200, await listStoreLiveDeliveries(pool, storeId, url.searchParams.get('limit')))
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

      const internalStoreDeliveriesMatch = url.pathname.match(/^\/v1\/internal\/stores\/([0-9a-f-]{36})\/deliveries$/i)
      if (req.method === 'GET' && internalStoreDeliveriesMatch) {
        requireInternalKey(req, config)
        return json(res, 200, await listStoreDeliveries(pool, internalStoreDeliveriesMatch[1], {
          limit:url.searchParams.get('limit'),
          since:url.searchParams.get('since'),
        }))
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

      if (req.method === 'POST' && url.pathname === '/v1/auth/exchange/supabase') {
        enforceAuthExchangeRate(req)
        const token = bearerToken(req)
        if (!token) return json(res, 401, { error:'authorization_required' })
        const result = await exchangeSupabaseAccessToken(pool, config, token)
        return json(res, 201, result)
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

      const publicCreateDeliveryMatch = url.pathname.match(/^\/v1\/stores\/([0-9a-f-]{36})\/deliveries$/i)
      if (req.method === 'POST' && publicCreateDeliveryMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'delivery:write')
        const storeId = await requireStoreSessionAccess(pool, session, publicCreateDeliveryMatch[1])
        const idempotencyKey = req.headers['idempotency-key']
        if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.length > 200) {
          return json(res, 400, { error:'invalid_idempotency_key' })
        }
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const input = validateDeliveryInput({ ...payload, storeId })
        const result = await createAvailableDelivery(pool, input, idempotencyKey.trim())
        return json(res, result.replayed ? 200 : 201, result)
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

      const publicCourierCommandMatch = url.pathname.match(/^\/v1\/deliveries\/([0-9a-f-]{36})\/(accept|reject|status|location)$/i)
      if (req.method === 'POST' && publicCourierCommandMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, publicCourierCommandMatch[2] === 'location' ? 'location:write' : 'delivery:command')
        const courierId = requireCourierSession(session)
        await requireDeliverySessionAccess(pool, session, publicCourierCommandMatch[1])
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const [, deliveryId, command] = publicCourierCommandMatch

        if (command === 'accept') return json(res, 200, await acceptDelivery(pool, deliveryId, courierId))
        if (command === 'reject') return json(res, 200, await rejectDelivery(pool, deliveryId, courierId, payload.reason))
        if (command === 'status') return json(res, 200, await advanceDeliveryStatus(pool, deliveryId, courierId, payload.status))
        if (command === 'location') {
          return json(res, 200, await recordDeliveryLocation(
            pool,
            deliveryId,
            courierId,
            payload.latitude,
            payload.longitude,
            payload.accuracyMeters,
          ))
        }
      }

      const publicStoreCancelMatch = url.pathname.match(/^\/v1\/stores\/([0-9a-f-]{36})\/deliveries\/([0-9a-f-]{36})\/cancel$/i)
      if (req.method === 'POST' && publicStoreCancelMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'delivery:write')
        const storeId = await requireStoreSessionAccess(pool, session, publicStoreCancelMatch[1])
        const payload = await readJson(req, config.requestBodyLimitBytes)
        return json(res, 200, await cancelDelivery(pool, publicStoreCancelMatch[2], storeId, payload.reason))
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

      const publicNetworkReviewMatch = url.pathname.match(/^\/v1\/stores\/([0-9a-f-]{36})\/courier-network\/review$/i)
      if (req.method === 'POST' && publicNetworkReviewMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'courier-network:review')
        const storeId = await requireStoreSessionAccess(pool, session, publicNetworkReviewMatch[1])
        const payload = await readJson(req, config.requestBodyLimitBytes)
        const result = await reviewCourierNetworkRequest(
          pool,
          storeId,
          payload.courierId,
          session.subjectId,
          payload.decision,
          payload.note,
        )
        return json(res, 200, result)
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

      const publicDispatchRouteMatch = url.pathname.match(/^\/v1\/stores\/([0-9a-f-]{36})\/dispatch-route$/i)
      if (req.method === 'POST' && publicDispatchRouteMatch) {
        const session = await requireBearerSession(req, pool)
        requireSessionScope(session, 'delivery:write')
        const storeId = await requireStoreSessionAccess(pool, session, publicDispatchRouteMatch[1])
        const payload = await readJson(req, config.requestBodyLimitBytes)
        return json(res, 200, await dispatchRouteToCourier(
          pool,
          storeId,
          payload.courierId,
          payload.deliveryIds,
        ))
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
      if (error instanceof SupabaseExchangeError) {
        return json(res, error.statusCode || 401, { error:error.message })
      }
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
