export class DeliveryQueryError extends Error {
  constructor(code, statusCode = 400) {
    super(code)
    this.name = 'DeliveryQueryError'
    this.statusCode = statusCode
  }
}

function uuid(value, code) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!pattern.test(normalized)) throw new DeliveryQueryError(code, 400)
  return normalized
}

function normalizeDelivery(row) {
  if (!row) return null
  return {
    id: row.id,
    storeId: row.store_id,
    assignedCourierId: row.assigned_courier_id,
    targetCourierId: row.target_courier_id,
    externalOrderId: row.external_order_id,
    status: row.status,
    pickupAddress: row.pickup_address,
    pickupLatitude: row.pickup_latitude,
    pickupLongitude: row.pickup_longitude,
    deliveryAddress: row.delivery_address,
    deliveryLatitude: row.delivery_latitude,
    deliveryLongitude: row.delivery_longitude,
    deliveryFee: Number(row.delivery_fee),
    pickupDistanceKm: row.pickup_distance_km === null ? null : Number(row.pickup_distance_km),
    deliveryDistanceKm: row.delivery_distance_km === null ? null : Number(row.delivery_distance_km),
    estimatedMinutes: row.estimated_minutes,
    paymentMethod: row.payment_method,
    orderTotal: row.order_total === null ? null : Number(row.order_total),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerNote: row.customer_note,
    itemCount: row.item_count,
    packageWeightKg: row.package_weight_kg === null ? null : Number(row.package_weight_kg),
    courierBatchId: row.courier_batch_id,
    readyAt: row.ready_at,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getDelivery(pool, rawDeliveryId) {
  const deliveryId = uuid(rawDeliveryId, 'invalid_delivery_id')
  const [rows] = await pool.execute(
    `SELECT *
       FROM deliveries
      WHERE id = ?
      LIMIT 1`,
    [deliveryId],
  )
  const delivery = normalizeDelivery(Array.isArray(rows) ? rows[0] : null)
  if (!delivery) throw new DeliveryQueryError('delivery_not_found', 404)

  const [historyRows] = await pool.execute(
    `SELECT status, changed_by, note, created_at
       FROM delivery_status_history
      WHERE delivery_id = ?
      ORDER BY created_at ASC`,
    [deliveryId],
  )

  return {
    delivery,
    history: (Array.isArray(historyRows) ? historyRows : []).map(row => ({
      status: row.status,
      changedBy: row.changed_by,
      note: row.note,
      createdAt: row.created_at,
    })),
  }
}

export async function listCourierActiveDeliveries(pool, rawCourierId) {
  const courierId = uuid(rawCourierId, 'invalid_courier_id')
  const [rows] = await pool.execute(
    `SELECT *
       FROM deliveries
      WHERE assigned_courier_id = ?
        AND status IN ('accepted','heading_to_pickup','at_pickup','heading_to_dropoff','at_dropoff')
      ORDER BY accepted_at ASC, created_at ASC`,
    [courierId],
  )

  return {
    courierId,
    count: Array.isArray(rows) ? rows.length : 0,
    capacity: 3,
    deliveries: (Array.isArray(rows) ? rows : []).map(normalizeDelivery),
  }
}

export async function listStoreLiveDeliveries(pool, rawStoreId, limitRaw = 100) {
  const storeId = uuid(rawStoreId, 'invalid_store_id')
  const limit = Math.max(1, Math.min(200, Number(limitRaw) || 100))
  const [rows] = await pool.query(
    `SELECT *
       FROM deliveries
      WHERE store_id = ?
        AND status NOT IN ('completed','cancelled','expired')
      ORDER BY created_at DESC
      LIMIT ${limit}`,
    [storeId],
  )

  return {
    storeId,
    count: Array.isArray(rows) ? rows.length : 0,
    deliveries: (Array.isArray(rows) ? rows : []).map(normalizeDelivery),
  }
}


export async function listCourierAvailableOffers(pool, rawCourierId, limitRaw = 50) {
  const courierId = uuid(rawCourierId, 'invalid_courier_id')
  const limit = Math.max(1, Math.min(100, Number(limitRaw) || 50))

  const [rows] = await pool.query(
    `SELECT d.*
       FROM deliveries d
      WHERE d.assigned_courier_id IS NULL
        AND d.status IN ('available','negotiating')
        AND (d.expires_at IS NULL OR d.expires_at > UTC_TIMESTAMP(6))
        AND (d.target_courier_id IS NULL OR d.target_courier_id = ?)
        AND NOT EXISTS (
          SELECT 1
            FROM delivery_offer_responses r
           WHERE r.delivery_id = d.id
             AND r.courier_id = ?
             AND r.response = 'rejected'
        )
      ORDER BY
        CASE WHEN d.target_courier_id = ? THEN 0 ELSE 1 END,
        d.published_at DESC,
        d.created_at DESC
      LIMIT ${limit}`,
    [courierId, courierId, courierId],
  )

  return {
    courierId,
    count:Array.isArray(rows) ? rows.length : 0,
    offers:(Array.isArray(rows) ? rows : []).map(row => {
      const delivery = normalizeDelivery(row)
      delivery.customerPhone = null
      delivery.customerNote = null
      return delivery
    }),
  }
}


export async function listStoreDeliveries(pool, rawStoreId, options = {}) {
  const storeId = uuid(rawStoreId, 'invalid_store_id')
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100))
  const sinceRaw = typeof options.since === 'string' ? options.since.trim() : ''
  let since = null

  if (sinceRaw) {
    const parsed = new Date(sinceRaw)
    if (Number.isNaN(parsed.getTime())) {
      throw new DeliveryQueryError('invalid_since', 400)
    }
    since = parsed
  }

  const params = [storeId]
  let where = 'WHERE store_id = ?'

  if (since) {
    where += ' AND created_at >= ?'
    params.push(since)
  }

  const [rows] = await pool.query(
    `SELECT *
       FROM deliveries
       ${where}
      ORDER BY created_at DESC
      LIMIT ${limit}`,
    params,
  )

  return {
    storeId,
    count:Array.isArray(rows) ? rows.length : 0,
    deliveries:(Array.isArray(rows) ? rows : []).map(normalizeDelivery),
  }
}
