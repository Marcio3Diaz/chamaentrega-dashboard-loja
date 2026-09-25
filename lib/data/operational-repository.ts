import type { Delivery, Store } from '@/lib/types'

export type StoreOrderRecord = {
  id: string
  store_id: string
  source: string
  external_order_id: string | null
  status: string
  fulfillment_type: string
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  delivery_latitude: number | null
  delivery_longitude: number | null
  items: unknown[]
  order_total: number
  payment_method: string | null
  payment_status: string | null
  customer_note: string | null
  delivery_id: string | null
  source_metadata: Record<string,unknown>
  received_at: string
  created_at: string
  updated_at: string
}

export type CourierOperationalRecord = {
  id: string
  vehicle_type: string | null
  is_online: boolean
  is_available: boolean
}

export type CourierProfileRecord = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export interface OperationalRepository {
  listStoresForUser(userId: string): Promise<Store[]>
  listDeliveriesByStore(storeId: string, limit?: number): Promise<Delivery[]>
  listDeliveriesSince(storeId: string, sinceIso: string, limit?: number): Promise<Delivery[]>
  listStoreOrders(storeId: string, limit?: number): Promise<StoreOrderRecord[]>
  listCouriers(): Promise<CourierOperationalRecord[]>
  listCourierProfilesByIds(ids: string[]): Promise<CourierProfileRecord[]>
}
