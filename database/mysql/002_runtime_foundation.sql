-- ChamaEntrega MySQL runtime foundation
-- Apply after database/mysql/schema.sql

CREATE TABLE IF NOT EXISTS `api_idempotency_keys` (
  `id` CHAR(36) NOT NULL,
  `scope` VARCHAR(180) NOT NULL,
  `idempotency_key` VARCHAR(200) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `resource_type` VARCHAR(80) NULL,
  `resource_id` CHAR(36) NULL,
  `response_json` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_idempotency_scope_key_uidx` (`scope`, `idempotency_key`),
  KEY `api_idempotency_expires_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` CHAR(36) NOT NULL,
  `event_key` VARCHAR(255) NOT NULL,
  `aggregate_type` VARCHAR(80) NOT NULL,
  `aggregate_id` CHAR(36) NOT NULL,
  `event_type` VARCHAR(120) NOT NULL,
  `payload` JSON NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `attempts` INT NOT NULL DEFAULT 0,
  `available_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `claimed_at` DATETIME(6) NULL,
  `processed_at` DATETIME(6) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `outbox_events_event_key_uidx` (`event_key`),
  KEY `outbox_events_pending_idx` (`status`, `available_at`, `created_at`),
  KEY `outbox_events_aggregate_idx` (`aggregate_type`, `aggregate_id`),
  CONSTRAINT `chk_outbox_status` CHECK (`status` IN ('pending','processing','processed','failed')),
  CONSTRAINT `chk_outbox_attempts` CHECK (`attempts` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
