export type Store = {
  id: string
  owner_id: string
  name: string
  phone: string | null
  logo_url: string | null
  address: string
  latitude: number | null
  longitude: number | null
  is_active: boolean
  moderation_status: 'pending' | 'active' | 'suspended' | 'banned' | 'rejected'
  moderation_reason?: string | null
  city: string | null
  state: string | null
}

export type Delivery = {
  id: string
  store_id: string
  assigned_courier_id: string | null
  external_order_id: string | null
  status: string
  pickup_address: string
  delivery_address: string
  delivery_fee: number
  pickup_distance_km: number | null
  delivery_distance_km: number | null
  estimated_minutes: number | null
  payment_method: string
  order_total: number | null
  customer_name: string | null
  customer_phone: string | null
  customer_note: string | null
  item_count: number
  package_weight_kg: number | null
  created_at: string
  updated_at: string
  ready_at: string | null
  accepted_at: string | null
  completed_at: string | null
}
