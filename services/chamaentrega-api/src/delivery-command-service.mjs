import { randomUUID } from 'node:crypto'

const ACTIVE_STATUSES = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

const NEXT_STATUS = new Map([
  ['accepted', 'heading_to_pickup'],
  ['heading_to_pickup', 'at_pickup'],
  ['at_pickup', 'heading_to_dropoff'],
  ['heading_to_dropoff', 'at_dropoff'],
  ['at_dropoff', 'completed'],
])

export function expectedNextDeliveryStatus(status) {
  return NEXT_STATUS.get(status) || null
}

export class DeliveryCommandError extends Error {
  constructor(code, statusCode = 409, details = {}) {
    super(code)
    this.name = 'DeliveryCommandError'
    this.statusCode = statusCode
    this.details = details
  }
}

function uuid(value, code) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!pattern.test(normalized)) throw new DeliveryCommandError(code, 400)
  return normalized
}

async function addHistory(connection, deliveryId, status, actorId, note = null) {
  await connection.execute(
    `INSERT INTO delivery_status_history
       (id, delivery_id, status, changed_by, note, created_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
    [randomUUID(), deliveryId, status, actorId, note],
  )
}

async function refreshCourierBatch(connection, batchId, courierId) {
  if (!batchId) return
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',')
  const [batchRows] = await connection.execute(
    'SELECT id, max_deliveries FROM courier_delivery_batches WHERE id = ? LIMIT 1 FOR UPDATE',
    [batchId],
  )
  const batch = Array.isArray(batchRows) ? batchRows[0] : null
  if (!batch) return

  const [countRows] = await connection.execute(
    `SELECT COUNT(*) AS total_count,
            SUM(CASE WHEN status IN (${placeholders}) THEN 1 ELSE 0 END) AS active_count
       FROM deliveries
      WHERE courier_batch_id = ?`,
    [...ACTIVE_STATUSES, batchId],
  )
  const total = Number(countRows?.[0]?.total_count || 0)
  const active = Number(countRows?.[0]?.active_count || 0)
  const max = Number(batch.max_deliveries || 3)
  const status = active === 0 ? 'completed' : total >= max ? 'locked' : 'open'

  await connection.execute(
    `UPDATE courier_delivery_batches
        SET status = ?,
            completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, UTC_TIMESTAMP(6)) ELSE NULL END
      WHERE id = ?`,
    [status, status, batchId],
  )
  await connection.execute(
    `UPDATE couriers
        SET is_available = CASE WHEN is_online = TRUE AND ? <> 'locked' THEN TRUE ELSE FALSE END,
            updated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [status, courierId],
  )
}

async function captureWalletReservation(connection, delivery) {
  const [rows] = await connection.execute(
    `SELECT id, wallet_id, store_id, amount, status
       FROM store_wallet_reservations
      WHERE delivery_id = ?
      LIMIT 1
      FOR UPDATE`,
    [delivery.id],
  )
  const reservation = Array.isArray(rows) ? rows[0] : null
  if (!reservation) throw new DeliveryCommandError('wallet_reservation_not_found')
  if (reservation.status === 'captured') return
  if (reservation.status !== 'reserved') throw new DeliveryCommandError('wallet_reservation_not_reserved')

  const [walletRows] = await connection.execute(
    'SELECT id, balance, reserved_balance FROM store_wallets WHERE id = ? LIMIT 1 FOR UPDATE',
    [reservation.wallet_id],
  )
  const wallet = Array.isArray(walletRows) ? walletRows[0] : null
  if (!wallet) throw new DeliveryCommandError('store_wallet_not_found')

  const amount = Number(reservation.amount)
  const before = Number(wallet.balance)
  if (before + 0.000001 < amount) throw new DeliveryCommandError('wallet_balance_inconsistent')
  const after = Number((before - amount).toFixed(2))

  await connection.execute(
    `UPDATE store_wallets
        SET balance = ?,
            reserved_balance = GREATEST(reserved_balance - ?, 0),
            updated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [after, amount, wallet.id],
  )
  await connection.execute(
    `UPDATE store_wallet_reservations
        SET status = 'captured', captured_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [reservation.id],
  )
  await connection.execute(
    `INSERT INTO store_wallet_transactions (
       id, wallet_id, store_id, transaction_type, direction, amount, status,
       description, reference_type, reference_id, balance_before, balance_after,
       metadata, created_at, completed_at
     ) VALUES (?, ?, ?, 'delivery_payment', 'debit', ?, 'completed',
       ?, 'delivery', ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [
      randomUUID(),
      wallet.id,
      delivery.store_id,
      amount,
      `Pagamento da entrega #${delivery.id.replaceAll('-', '').slice(0, 7).toUpperCase()}`,
      delivery.id,
      before,
      after,
      JSON.stringify({ delivery_id: delivery.id, captured_from_reservation: reservation.id }),
    ],
  )
}

async function releaseWalletReservation(connection, deliveryId, reason) {
  const [rows] = await connection.execute(
    `SELECT id, wallet_id, amount, status
       FROM store_wallet_reservations
      WHERE delivery_id = ?
      LIMIT 1
      FOR UPDATE`,
    [deliveryId],
  )
  const reservation = Array.isArray(rows) ? rows[0] : null
  if (!reservation || reservation.status !== 'reserved') return

  await connection.execute(
    `UPDATE store_wallets
        SET reserved_balance = GREATEST(reserved_balance - ?, 0),
            updated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [Number(reservation.amount), reservation.wallet_id],
  )
  await connection.execute(
    `UPDATE store_wallet_reservations
        SET status = 'released',
            released_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6),
            metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.released_reason', ?)
      WHERE id = ?`,
    [reason, reservation.id],
  )
}

export async function acceptDelivery(pool, deliveryIdRaw, courierIdRaw) {
  const deliveryId = uuid(deliveryIdRaw, 'invalid_delivery_id')
  const courierId = uuid(courierIdRaw, 'invalid_courier_id')
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [deliveryRows] = await connection.execute(
      `SELECT id, status, assigned_courier_id, target_courier_id, expires_at
         FROM deliveries WHERE id = ? LIMIT 1 FOR UPDATE`,
      [deliveryId],
    )
    const delivery = Array.isArray(deliveryRows) ? deliveryRows[0] : null
    if (!delivery) throw new DeliveryCommandError('delivery_not_found', 404)
    if (!['available', 'negotiating'].includes(delivery.status) || delivery.assigned_courier_id) {
      throw new DeliveryCommandError('delivery_not_available', 409, { currentStatus: delivery.status })
    }
    if (delivery.expires_at && new Date(delivery.expires_at).getTime() <= Date.now()) {
      throw new DeliveryCommandError('delivery_expired')
    }
    if (delivery.target_courier_id && delivery.target_courier_id !== courierId) {
      throw new DeliveryCommandError('delivery_target_mismatch', 403)
    }

    const [courierRows] = await connection.execute(
      `SELECT id, is_online, is_available, moderation_status
         FROM couriers WHERE id = ? LIMIT 1 FOR UPDATE`,
      [courierId],
    )
    const courier = Array.isArray(courierRows) ? courierRows[0] : null
    if (!courier || courier.moderation_status !== 'active') throw new DeliveryCommandError('courier_not_active', 403)
    if (!courier.is_online) throw new DeliveryCommandError('courier_offline')

    const placeholders = ACTIVE_STATUSES.map(() => '?').join(',')
    const [activeRows] = await connection.execute(
      `SELECT COUNT(*) AS active_count
         FROM deliveries
        WHERE assigned_courier_id = ?
          AND status IN (${placeholders})`,
      [courierId, ...ACTIVE_STATUSES],
    )
    const activeCount = Number(activeRows?.[0]?.active_count || 0)
    if (activeCount >= 3) {
      throw new DeliveryCommandError('courier_capacity_reached', 409, { activeDeliveries: activeCount, limit: 3 })
    }

    const [batchRows] = await connection.execute(
      `SELECT id, status, max_deliveries
         FROM courier_delivery_batches
        WHERE courier_id = ? AND status IN ('open', 'locked')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [courierId],
    )
    let batch = Array.isArray(batchRows) ? batchRows[0] : null
    if (batch?.status === 'locked') throw new DeliveryCommandError('courier_batch_locked')

    if (!batch) {
      batch = { id: randomUUID(), status: 'open', max_deliveries: 3 }
      await connection.execute(
        `INSERT INTO courier_delivery_batches
           (id, courier_id, status, max_deliveries, created_at)
         VALUES (?, ?, 'open', 3, UTC_TIMESTAMP(6))`,
        [batch.id, courierId],
      )
      if (activeCount > 0) {
        await connection.execute(
          `UPDATE deliveries
              SET courier_batch_id = ?
            WHERE assigned_courier_id = ?
              AND courier_batch_id IS NULL
              AND status IN (${placeholders})`,
          [batch.id, courierId, ...ACTIVE_STATUSES],
        )
      }
    }

    const [batchCountRows] = await connection.execute(
      'SELECT COUNT(*) AS total_count FROM deliveries WHERE courier_batch_id = ?',
      [batch.id],
    )
    if (Number(batchCountRows?.[0]?.total_count || 0) >= Number(batch.max_deliveries || 3)) {
      throw new DeliveryCommandError('courier_batch_locked')
    }

    const now = new Date()
    await connection.execute(
      `UPDATE deliveries
          SET assigned_courier_id = ?, courier_batch_id = ?, status = 'accepted',
              accepted_at = ?, updated_at = ?
        WHERE id = ?`,
      [courierId, batch.id, now, now, deliveryId],
    )
    await connection.execute(
      `INSERT INTO delivery_offer_responses
         (id, delivery_id, courier_id, response, created_at, updated_at)
       VALUES (?, ?, ?, 'accepted', ?, ?)`,
      [randomUUID(), deliveryId, courierId, now, now],
    )
    await addHistory(connection, deliveryId, 'accepted', courierId)
    await refreshCourierBatch(connection, batch.id, courierId)

    await connection.commit()
    return {
      deliveryId,
      courierId,
      batchId: batch.id,
      status: 'accepted',
      activeDeliveries: activeCount + 1,
      capacity: 3,
      acceptedAt: now.toISOString(),
    }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}

export async function rejectDelivery(pool, deliveryIdRaw, courierIdRaw, reasonRaw = null) {
  const deliveryId = uuid(deliveryIdRaw, 'invalid_delivery_id')
  const courierId = uuid(courierIdRaw, 'invalid_courier_id')
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim().slice(0, 500) : null
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, status, assigned_courier_id, target_courier_id
         FROM deliveries WHERE id = ? LIMIT 1 FOR UPDATE`,
      [deliveryId],
    )
    const delivery = Array.isArray(rows) ? rows[0] : null
    if (!delivery) throw new DeliveryCommandError('delivery_not_found', 404)
    if (!['available', 'negotiating'].includes(delivery.status) || delivery.assigned_courier_id) {
      throw new DeliveryCommandError('delivery_not_available')
    }
    if (delivery.target_courier_id && delivery.target_courier_id !== courierId) {
      throw new DeliveryCommandError('delivery_target_mismatch', 403)
    }

    await connection.execute(
      `INSERT INTO delivery_offer_responses
         (id, delivery_id, courier_id, response, reason, created_at, updated_at)
       VALUES (?, ?, ?, 'rejected', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
      [randomUUID(), deliveryId, courierId, reason],
    )

    let openedToNetwork = false
    if (delivery.target_courier_id === courierId) {
      openedToNetwork = true
      await connection.execute(
        'UPDATE deliveries SET target_courier_id = NULL, updated_at = UTC_TIMESTAMP(6) WHERE id = ?',
        [deliveryId],
      )
      await connection.execute(
        `INSERT INTO outbox_events
           (id, event_key, aggregate_type, aggregate_id, event_type, payload,
            status, available_at, created_at, updated_at)
         VALUES (?, ?, 'delivery', ?, 'delivery.available', ?, 'pending',
            UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [
          randomUUID(),
          `delivery.available:${deliveryId}:network:${randomUUID()}`,
          deliveryId,
          JSON.stringify({ deliveryId, targetCourierId: null, reopenedAfterRejection: true }),
        ],
      )
    }

    await connection.commit()
    return { deliveryId, courierId, status: 'available', rejected: true, openedToNetwork }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}

export async function advanceDeliveryStatus(pool, deliveryIdRaw, courierIdRaw, nextStatusRaw) {
  const deliveryId = uuid(deliveryIdRaw, 'invalid_delivery_id')
  const courierId = uuid(courierIdRaw, 'invalid_courier_id')
  const nextStatus = typeof nextStatusRaw === 'string' ? nextStatusRaw.trim() : ''
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, store_id, status, assigned_courier_id, courier_batch_id
         FROM deliveries WHERE id = ? LIMIT 1 FOR UPDATE`,
      [deliveryId],
    )
    const delivery = Array.isArray(rows) ? rows[0] : null
    if (!delivery) throw new DeliveryCommandError('delivery_not_found', 404)
    if (delivery.assigned_courier_id !== courierId) throw new DeliveryCommandError('delivery_not_assigned_to_courier', 403)

    const expected = expectedNextDeliveryStatus(delivery.status)
    if (!expected || expected !== nextStatus) {
      throw new DeliveryCommandError('invalid_delivery_status_transition', 409, {
        currentStatus: delivery.status,
        expectedStatus: expected || null,
      })
    }

    const now = new Date()
    await connection.execute(
      `UPDATE deliveries
          SET status = ?,
              completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
              updated_at = ?
        WHERE id = ?`,
      [nextStatus, nextStatus, now, now, deliveryId],
    )
    await addHistory(connection, deliveryId, nextStatus, courierId)

    if (nextStatus === 'completed') await captureWalletReservation(connection, delivery)
    await refreshCourierBatch(connection, delivery.courier_batch_id, courierId)

    await connection.commit()
    return { deliveryId, courierId, previousStatus: delivery.status, status: nextStatus, updatedAt: now.toISOString() }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}

export async function cancelDelivery(pool, deliveryIdRaw, storeIdRaw, reasonRaw = null) {
  const deliveryId = uuid(deliveryIdRaw, 'invalid_delivery_id')
  const storeId = uuid(storeIdRaw, 'invalid_store_id')
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim().slice(0, 500) : null
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, store_id, status, assigned_courier_id, courier_batch_id
         FROM deliveries WHERE id = ? LIMIT 1 FOR UPDATE`,
      [deliveryId],
    )
    const delivery = Array.isArray(rows) ? rows[0] : null
    if (!delivery) throw new DeliveryCommandError('delivery_not_found', 404)
    if (delivery.store_id !== storeId) throw new DeliveryCommandError('delivery_store_mismatch', 403)
    if (delivery.status === 'completed') throw new DeliveryCommandError('completed_delivery_cannot_be_cancelled')
    if (['cancelled', 'expired'].includes(delivery.status)) {
      await connection.commit()
      return { deliveryId, status: delivery.status, replayed: true }
    }

    await connection.execute(
      `UPDATE deliveries SET status = 'cancelled', updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
      [deliveryId],
    )
    await releaseWalletReservation(connection, deliveryId, reason || 'delivery_cancelled')
    await addHistory(connection, deliveryId, 'cancelled', null, reason)
    if (delivery.assigned_courier_id) {
      await refreshCourierBatch(connection, delivery.courier_batch_id, delivery.assigned_courier_id)
    }

    await connection.commit()
    return { deliveryId, status: 'cancelled', replayed: false }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}

export async function recordDeliveryLocation(pool, deliveryIdRaw, courierIdRaw, latitudeRaw, longitudeRaw, accuracyRaw = null) {
  const deliveryId = uuid(deliveryIdRaw, 'invalid_delivery_id')
  const courierId = uuid(courierIdRaw, 'invalid_courier_id')
  const latitude = Number(latitudeRaw)
  const longitude = Number(longitudeRaw)
  const accuracy = accuracyRaw === null || accuracyRaw === undefined ? null : Number(accuracyRaw)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new DeliveryCommandError('invalid_latitude', 400)
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new DeliveryCommandError('invalid_longitude', 400)
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 500)) {
    throw new DeliveryCommandError('invalid_accuracy', 400)
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT status, assigned_courier_id FROM deliveries WHERE id = ? LIMIT 1 FOR UPDATE',
      [deliveryId],
    )
    const delivery = Array.isArray(rows) ? rows[0] : null
    if (!delivery) throw new DeliveryCommandError('delivery_not_found', 404)
    if (delivery.assigned_courier_id !== courierId) throw new DeliveryCommandError('delivery_not_assigned_to_courier', 403)
    if (!ACTIVE_STATUSES.includes(delivery.status)) throw new DeliveryCommandError('delivery_not_active')

    const now = new Date()
    await connection.execute(
      `UPDATE couriers
          SET current_latitude = ?, current_longitude = ?, last_location_at = ?, updated_at = ?
        WHERE id = ?`,
      [latitude, longitude, now, now, courierId],
    )
    await connection.execute(
      `INSERT INTO delivery_location_points
         (id, delivery_id, courier_id, latitude, longitude, accuracy_meters, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), deliveryId, courierId, latitude, longitude, accuracy, now],
    )
    await connection.commit()
    return { deliveryId, courierId, latitude, longitude, accuracyMeters: accuracy, recordedAt: now.toISOString() }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}


export async function expireAvailableDeliveries(pool, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100))
  const connection = await pool.getConnection()
  const expired = []

  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(
      `SELECT id, assigned_courier_id, courier_batch_id
         FROM deliveries
        WHERE status IN ('available','negotiating')
          AND expires_at IS NOT NULL
          AND expires_at <= UTC_TIMESTAMP(6)
        ORDER BY expires_at
        LIMIT ${safeLimit}
        FOR UPDATE SKIP LOCKED`,
    )

    for (const delivery of Array.isArray(rows) ? rows : []) {
      await connection.execute(
        `UPDATE deliveries
            SET status = 'expired', updated_at = UTC_TIMESTAMP(6)
          WHERE id = ?`,
        [delivery.id],
      )
      await releaseWalletReservation(connection, delivery.id, 'delivery_expired')
      await addHistory(connection, delivery.id, 'expired', null, 'Expired by MySQL maintenance worker')
      if (delivery.assigned_courier_id) {
        await refreshCourierBatch(connection, delivery.courier_batch_id, delivery.assigned_courier_id)
      }
      expired.push(delivery.id)
    }

    await connection.commit()
    return { expiredCount: expired.length, deliveryIds: expired }
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}
