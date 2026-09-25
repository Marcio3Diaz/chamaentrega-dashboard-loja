import { randomUUID, createHash } from 'node:crypto'

export class InsufficientWalletBalanceError extends Error {
  constructor(available, required) {
    super('insufficient_wallet_balance')
    this.name = 'InsufficientWalletBalanceError'
    this.available = available
    this.required = required
  }
}

export class StoreUnavailableError extends Error {
  constructor() {
    super('store_unavailable')
    this.name = 'StoreUnavailableError'
  }
}

function requestHash(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export async function createAvailableDelivery(pool, input, idempotencyKey) {
  const connection = await pool.getConnection()
  const now = new Date()
  const deliveryId = input.deliveryId || randomUUID()
  const reservationId = randomUUID()
  const eventId = randomUUID()
  const idempotencyId = randomUUID()
  const keyScope = `delivery.create:${input.storeId}`
  const bodyHash = requestHash(input)

  try {
    await connection.beginTransaction()

    const [existingKeys] = await connection.execute(
      `SELECT request_hash, response_json
         FROM api_idempotency_keys
        WHERE scope = ? AND idempotency_key = ?
        LIMIT 1
        FOR UPDATE`,
      [keyScope, idempotencyKey],
    )

    if (Array.isArray(existingKeys) && existingKeys[0]) {
      const existing = existingKeys[0]
      if (existing.request_hash !== bodyHash) {
        const error = new Error('idempotency_key_reused_with_different_payload')
        error.name = 'IdempotencyConflictError'
        throw error
      }
      await connection.commit()
      const value = typeof existing.response_json === 'string'
        ? JSON.parse(existing.response_json)
        : existing.response_json
      return { ...value, replayed: true }
    }

    const [stores] = await connection.execute(
      `SELECT id, name, address, latitude, longitude, is_active, moderation_status
         FROM stores
        WHERE id = ?
        LIMIT 1`,
      [input.storeId],
    )
    const store = Array.isArray(stores) ? stores[0] : null
    if (!store || !store.is_active || store.moderation_status !== 'active') {
      throw new StoreUnavailableError()
    }

    const [wallets] = await connection.execute(
      `SELECT id, balance, reserved_balance
         FROM store_wallets
        WHERE store_id = ?
        LIMIT 1
        FOR UPDATE`,
      [input.storeId],
    )
    const wallet = Array.isArray(wallets) ? wallets[0] : null
    if (!wallet) throw new Error('store_wallet_not_found')

    const available = Number(wallet.balance) - Number(wallet.reserved_balance)
    if (available + 0.000001 < input.deliveryFee) {
      throw new InsufficientWalletBalanceError(available, input.deliveryFee)
    }

    const expiresAt = new Date(now.getTime() + input.secondsToAccept * 1000)

    await connection.execute(
      `INSERT INTO deliveries (
         id, store_id, target_courier_id, external_order_id, status,
         pickup_address, pickup_latitude, pickup_longitude,
         delivery_address, delivery_latitude, delivery_longitude,
         delivery_fee, pickup_distance_km, delivery_distance_km,
         estimated_minutes, payment_method, order_total,
         customer_name, customer_phone, customer_note, item_count,
         package_weight_kg, seconds_to_accept, ready_at, published_at,
         expires_at, created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, 'available',
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        deliveryId, input.storeId, input.targetCourierId, input.externalOrderId,
        input.pickupAddress, input.pickupLatitude, input.pickupLongitude,
        input.deliveryAddress, input.deliveryLatitude, input.deliveryLongitude,
        input.deliveryFee, input.pickupDistanceKm, input.deliveryDistanceKm,
        input.estimatedMinutes, input.paymentMethod, input.orderTotal,
        input.customerName, input.customerPhone, input.customerNote, input.itemCount,
        input.packageWeightKg, input.secondsToAccept, now, now, expiresAt, now, now,
      ],
    )

    await connection.execute(
      `UPDATE store_wallets
          SET reserved_balance = reserved_balance + ?, updated_at = ?
        WHERE id = ?`,
      [input.deliveryFee, now, wallet.id],
    )

    await connection.execute(
      `INSERT INTO store_wallet_reservations (
         id, wallet_id, store_id, delivery_id, amount, status,
         created_at, updated_at, metadata
       ) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
      [
        reservationId, wallet.id, input.storeId, deliveryId, input.deliveryFee,
        now, now,
        JSON.stringify({ reserved_from_status: 'available', migration_api: true }),
      ],
    )

    const eventPayload = {
      deliveryId,
      storeId: input.storeId,
      targetCourierId: input.targetCourierId,
      deliveryFee: input.deliveryFee,
      customerName: input.customerName,
      pickupAddress: input.pickupAddress,
      deliveryAddress: input.deliveryAddress,
      expiresAt: expiresAt.toISOString(),
    }

    await connection.execute(
      `INSERT INTO outbox_events (
         id, event_key, aggregate_type, aggregate_id, event_type,
         payload, status, available_at, created_at, updated_at
       ) VALUES (?, ?, 'delivery', ?, 'delivery.available', ?, 'pending', ?, ?, ?)`,
      [
        eventId, `delivery.available:${deliveryId}`, deliveryId,
        JSON.stringify(eventPayload), now, now, now,
      ],
    )

    const response = {
      deliveryId,
      reservationId,
      status: 'available',
      deliveryFee: input.deliveryFee,
      walletAvailableBefore: Number(available.toFixed(2)),
      walletAvailableAfter: Number((available - input.deliveryFee).toFixed(2)),
      publishedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      replayed: false,
    }

    await connection.execute(
      `INSERT INTO api_idempotency_keys (
         id, scope, idempotency_key, request_hash,
         resource_type, resource_id, response_json, created_at, expires_at
       ) VALUES (?, ?, ?, ?, 'delivery', ?, ?, ?, ?)`,
      [
        idempotencyId, keyScope, idempotencyKey, bodyHash, deliveryId,
        JSON.stringify(response), now,
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      ],
    )

    await connection.commit()
    return response
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    connection.release()
  }
}
