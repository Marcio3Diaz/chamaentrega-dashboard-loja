import { enqueueRealtimeEvent } from './realtime-events.mjs'

export class CourierNetworkError extends Error {
  constructor(code, statusCode = 409) {
    super(code)
    this.name = 'CourierNetworkError'
    this.statusCode = statusCode
  }
}

function uuid(value, code) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!pattern.test(normalized)) throw new CourierNetworkError(code, 400)
  return normalized
}

export async function reviewCourierNetworkRequest(
  pool,
  storeIdRaw,
  courierIdRaw,
  reviewerIdRaw,
  decisionRaw,
  noteRaw = null,
) {
  const storeId = uuid(storeIdRaw, 'invalid_store_id')
  const courierId = uuid(courierIdRaw, 'invalid_courier_id')
  const reviewerId = uuid(reviewerIdRaw, 'invalid_reviewer_id')
  const decision = typeof decisionRaw === 'string' ? decisionRaw.trim() : ''
  const note = typeof noteRaw === 'string' && noteRaw.trim()
    ? noteRaw.trim().slice(0, 1000)
    : null

  if (!['connected', 'rejected'].includes(decision)) {
    throw new CourierNetworkError('invalid_decision', 400)
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [accessRows] = await connection.execute(
      `SELECT 1 AS ok
         FROM stores s
        WHERE s.id = ?
          AND (
            s.owner_id = ?
            OR EXISTS (
              SELECT 1
                FROM store_members sm
               WHERE sm.store_id = s.id
                 AND sm.user_id = ?
                 AND sm.status = 'active'
            )
          )
        LIMIT 1`,
      [storeId, reviewerId, reviewerId],
    )
    if (!Array.isArray(accessRows) || !accessRows[0]) {
      throw new CourierNetworkError('store_access_required', 403)
    }

    const [rows] = await connection.execute(
      `SELECT id, status
         FROM courier_store_networks
        WHERE store_id = ? AND courier_id = ?
        LIMIT 1
        FOR UPDATE`,
      [storeId, courierId],
    )
    const request = Array.isArray(rows) ? rows[0] : null
    if (!request) throw new CourierNetworkError('request_not_found', 404)
    if (request.status !== 'pending') {
      throw new CourierNetworkError('request_already_reviewed', 409)
    }

    await connection.execute(
      `UPDATE courier_store_networks
          SET status = ?,
              reviewed_at = UTC_TIMESTAMP(6),
              reviewed_by = ?,
              review_note = ?,
              updated_at = UTC_TIMESTAMP(6)
        WHERE id = ?`,
      [decision, reviewerId, note, request.id],
    )

    const realtimePayload = {
      storeId,
      courierId,
      reviewerId,
      status:decision,
      note,
    }
    await enqueueRealtimeEvent(
      connection,
      'store',
      storeId,
      'courier_network.reviewed',
      realtimePayload,
    )
    await enqueueRealtimeEvent(
      connection,
      'courier',
      courierId,
      'courier_network.reviewed',
      realtimePayload,
    )

    await connection.commit()
    return {
      storeId,
      courierId,
      reviewerId,
      decision,
      status: decision,
    }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}
