import type { RowDataPacket } from 'mysql2/promise'
import { getMysqlPool } from '@/lib/database/mysql'
import type { Delivery, Store } from '@/lib/types'
import type {
  OperationalRepository,
  StoreOrderRecord,
  CourierOperationalRecord,
  CourierProfileRecord,
} from '@/lib/data/operational-repository'

type StoreRow = RowDataPacket & Store
type DeliveryRow = RowDataPacket & Delivery
type CourierRow = RowDataPacket & CourierOperationalRecord
type CourierProfileRow = RowDataPacket & CourierProfileRecord

type StoreOrderRow = RowDataPacket & Omit<StoreOrderRecord,'items'|'source_metadata'> & {
  items: unknown
  source_metadata: unknown
}

function clampLimit(limit: number, fallback: number, max: number) {
  if (!Number.isFinite(limit)) return fallback
  return Math.max(1, Math.min(Math.trunc(limit), max))
}

function toMysqlDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Data inválida para consulta MySQL.')
  }

  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value !== 'string') return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export class MysqlOperationalRepository implements OperationalRepository {
  async listStoresForUser(userId: string): Promise<Store[]> {
    const pool = getMysqlPool()
    const [rows] = await pool.execute<StoreRow[]>(
      `SELECT DISTINCT
        s.id,
        s.owner_id,
        s.name,
        s.phone,
        s.logo_url,
        s.address,
        s.latitude,
        s.longitude,
        s.is_active,
        s.moderation_status,
        s.moderation_reason,
        s.city,
        s.state
      FROM stores s
      LEFT JOIN store_members sm
        ON sm.store_id = s.id
       AND sm.user_id = ?
       AND sm.status = 'active'
      WHERE s.owner_id = ? OR sm.user_id IS NOT NULL
      ORDER BY s.is_active DESC, s.created_at ASC`,
      [userId, userId],
    )

    return rows.map(row => ({
      ...row,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      is_active: Boolean(row.is_active),
    }))
  }

  async listDeliveriesByStore(storeId: string, limit = 100): Promise<Delivery[]> {
    const pool = getMysqlPool()
    const safeLimit = clampLimit(limit, 100, 2000)

    const [rows] = await pool.execute<DeliveryRow[]>(
      `SELECT *
       FROM deliveries
       WHERE store_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [storeId, safeLimit],
    )

    return rows.map(row => ({
      ...row,
      delivery_fee: Number(row.delivery_fee ?? 0),
      pickup_distance_km: row.pickup_distance_km == null ? null : Number(row.pickup_distance_km),
      delivery_distance_km: row.delivery_distance_km == null ? null : Number(row.delivery_distance_km),
      order_total: row.order_total == null ? null : Number(row.order_total),
      package_weight_kg: row.package_weight_kg == null ? null : Number(row.package_weight_kg),
    }))
  }

  async listDeliveriesSince(storeId: string, sinceIso: string, limit = 500): Promise<Delivery[]> {
    const pool = getMysqlPool()
    const safeLimit = clampLimit(limit, 500, 5000)
    const since = toMysqlDateTime(sinceIso)

    const [rows] = await pool.execute<DeliveryRow[]>(
      `SELECT *
       FROM deliveries
       WHERE store_id = ?
         AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [storeId, since, safeLimit],
    )

    return rows.map(row => ({
      ...row,
      delivery_fee: Number(row.delivery_fee ?? 0),
      pickup_distance_km: row.pickup_distance_km == null ? null : Number(row.pickup_distance_km),
      delivery_distance_km: row.delivery_distance_km == null ? null : Number(row.delivery_distance_km),
      order_total: row.order_total == null ? null : Number(row.order_total),
      package_weight_kg: row.package_weight_kg == null ? null : Number(row.package_weight_kg),
    }))
  }

  async listStoreOrders(storeId: string, limit = 250): Promise<StoreOrderRecord[]> {
    const pool = getMysqlPool()
    const safeLimit = clampLimit(limit, 250, 2000)

    const [rows] = await pool.execute<StoreOrderRow[]>(
      `SELECT
        id,
        store_id,
        source,
        external_order_id,
        status,
        fulfillment_type,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        items,
        order_total,
        payment_method,
        payment_status,
        customer_note,
        delivery_id,
        source_metadata,
        received_at,
        created_at,
        updated_at
      FROM store_orders
      WHERE store_id = ?
      ORDER BY received_at DESC
      LIMIT ?`,
      [storeId, safeLimit],
    )

    return rows.map(row => ({
      ...row,
      delivery_latitude: row.delivery_latitude == null ? null : Number(row.delivery_latitude),
      delivery_longitude: row.delivery_longitude == null ? null : Number(row.delivery_longitude),
      items: parseJson<unknown[]>(row.items, []),
      order_total: Number(row.order_total ?? 0),
      source_metadata: parseJson<Record<string,unknown>>(row.source_metadata, {}),
    }))
  }

  async listCouriers(): Promise<CourierOperationalRecord[]> {
    const pool = getMysqlPool()
    const [rows] = await pool.execute<CourierRow[]>(
      `SELECT id, vehicle_type, is_online, is_available
       FROM couriers`,
    )

    return rows.map(row => ({
      id: row.id,
      vehicle_type: row.vehicle_type,
      is_online: Boolean(row.is_online),
      is_available: Boolean(row.is_available),
    }))
  }

  async listCourierProfilesByIds(ids: string[]): Promise<CourierProfileRecord[]> {
    if (!ids.length) return []

    const pool = getMysqlPool()
    const uniqueIds = Array.from(new Set(ids))
    const placeholders = uniqueIds.map(() => '?').join(',')

    const [rows] = await pool.execute<CourierProfileRow[]>(
      `SELECT id, full_name, avatar_url
       FROM profiles
       WHERE id IN (${placeholders})`,
      uniqueIds,
    )

    return rows.map(row => ({
      id: row.id,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
    }))
  }
}
