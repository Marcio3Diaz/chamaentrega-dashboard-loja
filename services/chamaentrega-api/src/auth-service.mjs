import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export class ApiSessionError extends Error {
  constructor(code, statusCode = 401) {
    super(code)
    this.name = 'ApiSessionError'
    this.statusCode = statusCode
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function uuid(value, code) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!pattern.test(normalized)) throw new ApiSessionError(code, 400)
  return normalized
}

function normalizeRole(value) {
  const role = typeof value === 'string' ? value.trim() : ''
  if (!['store_owner','store_member','courier','admin'].includes(role)) {
    throw new ApiSessionError('invalid_session_role', 400)
  }
  return role
}

function normalizeScopes(value, role) {
  const provided = Array.isArray(value)
    ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean)
    : []

  const defaults = role === 'courier'
    ? ['delivery:read','delivery:command','location:write','realtime:connect']
    : role === 'admin'
      ? ['admin:*','store:*','delivery:*','realtime:connect']
      : ['store:read','delivery:read','delivery:write','courier-network:review','realtime:connect']

  return [...new Set(provided.length ? provided : defaults)].slice(0, 40)
}

export async function createApiSession(pool, input, ttlSecondsRaw = 28800) {
  const subjectId = uuid(input?.subjectId, 'invalid_subject_id')
  const subjectRole = normalizeRole(input?.subjectRole)
  const scopes = normalizeScopes(input?.scopes, subjectRole)
  const ttlSeconds = Math.max(300, Math.min(7 * 24 * 3600, Number(ttlSecondsRaw) || 28800))
  const rawToken = randomBytes(32).toString('base64url')
  const hash = tokenHash(rawToken)
  const sessionId = randomUUID()

  if (subjectRole === 'courier') {
    const [rows] = await pool.execute(
      'SELECT id, moderation_status FROM couriers WHERE id = ? LIMIT 1',
      [subjectId],
    )
    if (!rows?.[0] || rows[0].moderation_status !== 'active') {
      throw new ApiSessionError('courier_not_active', 403)
    }
  } else if (subjectRole !== 'admin') {
    const [rows] = await pool.execute(
      `SELECT 1 AS ok
         FROM stores s
        WHERE s.owner_id = ?
           OR EXISTS (
             SELECT 1 FROM store_members sm
              WHERE sm.user_id = ?
                AND sm.status = 'active'
           )
        LIMIT 1`,
      [subjectId, subjectId],
    )
    if (!rows?.[0]) throw new ApiSessionError('store_access_required', 403)
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  await pool.execute(
    `INSERT INTO api_sessions
       (id, token_hash, subject_id, subject_role, issued_by, scopes, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'migration_bridge', ?, UTC_TIMESTAMP(6), ?)`,
    [sessionId, hash, subjectId, subjectRole, JSON.stringify(scopes), expiresAt],
  )

  return {
    token: rawToken,
    tokenType: 'Bearer',
    expiresIn: ttlSeconds,
    session: {
      id: sessionId,
      subjectId,
      subjectRole,
      scopes,
    },
  }
}

export async function authenticateApiSession(pool, rawToken) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : ''
  if (token.length < 32 || token.length > 200) throw new ApiSessionError('invalid_session_token')
  const hash = tokenHash(token)

  const [rows] = await pool.execute(
    `SELECT id, token_hash, subject_id, subject_role, scopes, expires_at, revoked_at
       FROM api_sessions
      WHERE token_hash = ?
      LIMIT 1`,
    [hash],
  )
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) throw new ApiSessionError('invalid_session_token')

  const left = Buffer.from(hash)
  const right = Buffer.from(String(row.token_hash))
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiSessionError('invalid_session_token')
  }
  if (row.revoked_at) throw new ApiSessionError('session_revoked')
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new ApiSessionError('session_expired')

  const scopes = typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes
  void pool.execute(
    'UPDATE api_sessions SET last_seen_at = UTC_TIMESTAMP(6) WHERE id = ?',
    [row.id],
  ).catch(() => {})

  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectRole: row.subject_role,
    scopes: Array.isArray(scopes) ? scopes : [],
  }
}

export async function revokeApiSession(pool, sessionIdRaw, subjectIdRaw = null) {
  const sessionId = uuid(sessionIdRaw, 'invalid_session_id')
  const subjectId = subjectIdRaw ? uuid(subjectIdRaw, 'invalid_subject_id') : null

  const [result] = await pool.execute(
    `UPDATE api_sessions
        SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(6))
      WHERE id = ?
        AND (? IS NULL OR subject_id = ?)`,
    [sessionId, subjectId, subjectId],
  )
  return { revoked: Number(result?.affectedRows || 0) > 0 }
}

export async function canAccessRealtimeChannel(pool, session, channel) {
  if (typeof channel !== 'string') return false
  if (session.subjectRole === 'admin') {
    return /^admin$|^courier_pool$|^store:[0-9a-f-]{36}$|^courier:[0-9a-f-]{36}$/i.test(channel)
  }
  if (channel === 'courier_pool') return session.subjectRole === 'courier'

  const courierMatch = channel.match(/^courier:([0-9a-f-]{36})$/i)
  if (courierMatch) {
    return session.subjectRole === 'courier' && courierMatch[1] === session.subjectId
  }

  const storeMatch = channel.match(/^store:([0-9a-f-]{36})$/i)
  if (!storeMatch || session.subjectRole === 'courier') return false
  const storeId = storeMatch[1]

  const [rows] = await pool.execute(
    `SELECT 1 AS ok
       FROM stores s
      WHERE s.id = ?
        AND (
          s.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM store_members sm
             WHERE sm.store_id = s.id
               AND sm.user_id = ?
               AND sm.status = 'active'
          )
        )
      LIMIT 1`,
    [storeId, session.subjectId, session.subjectId],
  )
  return Boolean(rows?.[0])
}


export function sessionHasScope(session, scope) {
  const scopes = Array.isArray(session?.scopes) ? session.scopes : []
  if (scopes.includes('admin:*')) return true
  if (scopes.includes(scope)) return true
  const [namespace] = String(scope).split(':')
  return scopes.includes(`${namespace}:*`)
}

export function requireSessionScope(session, scope) {
  if (!sessionHasScope(session, scope)) {
    throw new ApiSessionError('session_scope_required', 403)
  }
}

export function requireCourierSession(session) {
  if (session?.subjectRole !== 'courier') {
    throw new ApiSessionError('courier_session_required', 403)
  }
  return session.subjectId
}

export async function requireStoreSessionAccess(pool, session, rawStoreId) {
  const storeId = uuid(rawStoreId, 'invalid_store_id')
  if (session?.subjectRole === 'admin') return storeId
  if (!['store_owner','store_member'].includes(session?.subjectRole)) {
    throw new ApiSessionError('store_session_required', 403)
  }

  const [rows] = await pool.execute(
    `SELECT 1 AS ok
       FROM stores s
      WHERE s.id = ?
        AND (
          s.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM store_members sm
             WHERE sm.store_id = s.id
               AND sm.user_id = ?
               AND sm.status = 'active'
          )
        )
      LIMIT 1`,
    [storeId, session.subjectId, session.subjectId],
  )
  if (!rows?.[0]) throw new ApiSessionError('store_access_denied', 403)
  return storeId
}

export async function requireDeliverySessionAccess(pool, session, rawDeliveryId) {
  const deliveryId = uuid(rawDeliveryId, 'invalid_delivery_id')
  const [rows] = await pool.execute(
    `SELECT id, store_id, status, assigned_courier_id, target_courier_id
       FROM deliveries
      WHERE id = ?
      LIMIT 1`,
    [deliveryId],
  )
  const delivery = Array.isArray(rows) ? rows[0] : null
  if (!delivery) throw new ApiSessionError('delivery_not_found', 404)

  if (session?.subjectRole === 'admin') return delivery
  if (session?.subjectRole === 'courier') {
    const isAssigned = delivery.assigned_courier_id === session.subjectId
    const isTargeted = delivery.target_courier_id === session.subjectId
    const isOpenOffer =
      !delivery.assigned_courier_id &&
      !delivery.target_courier_id &&
      ['available','negotiating'].includes(delivery.status)

    if (!isAssigned && !isTargeted && !isOpenOffer) {
      throw new ApiSessionError('delivery_access_denied', 403)
    }
    return delivery
  }

  await requireStoreSessionAccess(pool, session, delivery.store_id)
  return delivery
}
