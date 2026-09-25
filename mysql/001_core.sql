-- ChamaEntrega - MySQL core schema (fase 1)
-- Mantém nomes e formatos próximos ao schema atual para facilitar migração gradual.
-- Compatível com MySQL 8+.

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL,
  full_name VARCHAR(160) NULL,
  phone VARCHAR(40) NULL,
  avatar_url TEXT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'store_owner',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_profiles_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stores (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  phone VARCHAR(40) NULL,
  logo_url TEXT NULL,
  address VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  moderation_status ENUM('pending','active','suspended','banned','rejected') NOT NULL DEFAULT 'pending',
  moderation_reason TEXT NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(80) NULL,
  zip_code VARCHAR(30) NULL,
  street VARCHAR(180) NULL,
  street_number VARCHAR(40) NULL,
  complement VARCHAR(180) NULL,
  neighborhood VARCHAR(120) NULL,
  organization_id CHAR(36) NULL,
  moderated_at DATETIME(3) NULL,
  moderated_by CHAR(36) NULL,
  approved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_stores_owner (owner_id),
  KEY idx_stores_active (is_active),
  KEY idx_stores_moderation (moderation_status),
  CONSTRAINT fk_stores_owner FOREIGN KEY (owner_id) REFERENCES profiles(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_members (
  store_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  role VARCHAR(40) NOT NULL DEFAULT 'operator',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (store_id,user_id),
  KEY idx_store_members_user_status (user_id,status),
  CONSTRAINT fk_store_members_store FOREIGN KEY (store_id) REFERENCES stores(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_store_members_user FOREIGN KEY (user_id) REFERENCES profiles(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS couriers (
  id CHAR(36) NOT NULL,
  vehicle_type VARCHAR(40) NULL,
  is_online TINYINT(1) NOT NULL DEFAULT 0,
  is_available TINYINT(1) NOT NULL DEFAULT 0,
  rating DECIMAL(4,2) NOT NULL DEFAULT 0,
  total_deliveries INT NOT NULL DEFAULT 0,
  current_latitude DECIMAL(10,7) NULL,
  current_longitude DECIMAL(10,7) NULL,
  last_location_at DATETIME(3) NULL,
  moderation_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  moderation_reason TEXT NULL,
  moderated_at DATETIME(3) NULL,
  moderated_by CHAR(36) NULL,
  approved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_couriers_availability (is_online,is_available),
  CONSTRAINT fk_couriers_profile FOREIGN KEY (id) REFERENCES profiles(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deliveries (
  id CHAR(36) NOT NULL,
  store_id CHAR(36) NOT NULL,
  assigned_courier_id CHAR(36) NULL,
  external_order_id VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  pickup_address VARCHAR(500) NOT NULL,
  delivery_address VARCHAR(500) NOT NULL,
  pickup_latitude DECIMAL(10,7) NULL,
  pickup_longitude DECIMAL(10,7) NULL,
  delivery_latitude DECIMAL(10,7) NULL,
  delivery_longitude DECIMAL(10,7) NULL,
  delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  pickup_distance_km DECIMAL(10,3) NULL,
  delivery_distance_km DECIMAL(10,3) NULL,
  estimated_minutes INT NULL,
  payment_method VARCHAR(60) NULL,
  order_total DECIMAL(12,2) NULL,
  customer_name VARCHAR(180) NULL,
  customer_phone VARCHAR(40) NULL,
  customer_note TEXT NULL,
  item_count INT NOT NULL DEFAULT 0,
  package_weight_kg DECIMAL(10,3) NULL,
  seconds_to_accept INT NOT NULL DEFAULT 0,
  published_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  courier_batch_id CHAR(36) NULL,
  target_courier_id CHAR(36) NULL,
  dispatch_route_group_id CHAR(36) NULL,
  ready_at DATETIME(3) NULL,
  accepted_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_deliveries_store_created (store_id,created_at),
  KEY idx_deliveries_store_status (store_id,status),
  KEY idx_deliveries_courier (assigned_courier_id),
  KEY idx_deliveries_external_order (external_order_id),
  CONSTRAINT fk_deliveries_store FOREIGN KEY (store_id) REFERENCES stores(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_deliveries_courier FOREIGN KEY (assigned_courier_id) REFERENCES couriers(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_orders (
  id CHAR(36) NOT NULL,
  store_id CHAR(36) NOT NULL,
  source VARCHAR(40) NOT NULL,
  external_order_id VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL,
  fulfillment_type VARCHAR(40) NOT NULL DEFAULT 'delivery',
  customer_name VARCHAR(180) NULL,
  customer_phone VARCHAR(40) NULL,
  delivery_address VARCHAR(500) NULL,
  delivery_latitude DECIMAL(10,7) NULL,
  delivery_longitude DECIMAL(10,7) NULL,
  items JSON NOT NULL,
  order_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(60) NULL,
  payment_status VARCHAR(40) NULL,
  customer_note TEXT NULL,
  delivery_id CHAR(36) NULL,
  source_metadata JSON NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_store_orders_store_received (store_id,received_at),
  KEY idx_store_orders_store_status (store_id,status),
  KEY idx_store_orders_delivery (delivery_id),
  KEY idx_store_orders_source_external (source,external_order_id),
  CONSTRAINT fk_store_orders_store FOREIGN KEY (store_id) REFERENCES stores(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_store_orders_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
