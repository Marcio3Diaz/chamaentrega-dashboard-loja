const ACTIVE_STATUSES = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

function uuid(value, code) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!pattern.test(normalized)) {
    const error = new Error(code)
    error.statusCode = 400
    throw error
  }
  return normalized
}

function iso(value) {
  if (!value) return null
  return new Date(value).toISOString()
}

export async function listStoreCouriers(pool, rawStoreId) {
  const storeId = uuid(rawStoreId, 'invalid_store_id')

  const [networkRows] = await pool.execute(
    `SELECT
       n.id AS network_id,
       n.courier_id,
       n.status AS network_status,
       n.requested_at,
       n.reviewed_at,
       n.created_at AS connected_at,
       n.updated_at AS network_updated_at,
       c.vehicle_type,
       c.is_online,
       c.is_available,
       c.rating,
       c.total_deliveries,
       c.current_latitude,
       c.current_longitude,
       c.last_location_at,
       c.moderation_status,
       p.full_name,
       p.phone,
       p.avatar_url
     FROM courier_store_networks n
     LEFT JOIN couriers c ON c.id = n.courier_id
     LEFT JOIN profiles p ON p.id = n.courier_id
     WHERE n.store_id = ?
     ORDER BY n.requested_at DESC`,
    [storeId],
  )

  const rows = Array.isArray(networkRows) ? networkRows : []
  const connectedIds = rows
    .filter(row => row.network_status === 'connected' && row.vehicle_type)
    .map(row => row.courier_id)

  const activeByCourier = new Map()
  if (connectedIds.length) {
    const placeholders = connectedIds.map(() => '?').join(',')
    const activePlaceholders = ACTIVE_STATUSES.map(() => '?').join(',')
    const [deliveryRows] = await pool.execute(
      `SELECT
         id,
         assigned_courier_id,
         status,
         customer_name,
         delivery_address,
         delivery_fee,
         estimated_minutes,
         updated_at
       FROM deliveries
       WHERE store_id = ?
         AND assigned_courier_id IN (${placeholders})
         AND status IN (${activePlaceholders})
       ORDER BY updated_at DESC`,
      [storeId, ...connectedIds, ...ACTIVE_STATUSES],
    )

    for (const delivery of Array.isArray(deliveryRows) ? deliveryRows : []) {
      if (!delivery.assigned_courier_id || activeByCourier.has(delivery.assigned_courier_id)) continue
      activeByCourier.set(delivery.assigned_courier_id, {
        id:delivery.id,
        status:delivery.status,
        customerName:delivery.customer_name,
        deliveryAddress:delivery.delivery_address,
        deliveryFee:Number(delivery.delivery_fee || 0),
        estimatedMinutes:delivery.estimated_minutes == null ? null : Number(delivery.estimated_minutes),
        updatedAt:iso(delivery.updated_at),
      })
    }
  }

  const connected = []
  const pending = []

  for (const row of rows) {
    const common = {
      courierId:row.courier_id,
      fullName:row.full_name?.trim() || 'Entregador parceiro',
      phone:row.phone ?? null,
      avatarUrl:row.avatar_url ?? null,
      vehicleType:row.vehicle_type ?? null,
      isOnline:Boolean(row.is_online),
      isAvailable:Boolean(row.is_available),
      rating:Number(row.rating || 0),
      totalDeliveries:Number(row.total_deliveries || 0),
      currentLatitude:row.current_latitude == null ? null : Number(row.current_latitude),
      currentLongitude:row.current_longitude == null ? null : Number(row.current_longitude),
      lastLocationAt:iso(row.last_location_at),
      moderationStatus:row.moderation_status ?? null,
    }

    if (row.network_status === 'connected' && row.vehicle_type) {
      connected.push({
        ...common,
        connectedAt:iso(row.connected_at),
        activeDelivery:activeByCourier.get(row.courier_id) ?? null,
      })
    } else if (row.network_status === 'pending') {
      pending.push({
        ...common,
        requestedAt:iso(row.requested_at) ?? new Date().toISOString(),
      })
    }
  }

  return {
    storeId,
    connectedCount:connected.length,
    pendingCount:pending.length,
    connected,
    pending,
  }
}
