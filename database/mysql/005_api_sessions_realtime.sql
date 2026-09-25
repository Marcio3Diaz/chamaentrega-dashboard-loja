-- ChamaEntrega migration-native sessions and realtime event relay.
-- Apply after 004_text_capacity.sql.

CREATE TABLE IF NOT EXISTS `api_sessions` (
  `id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `subject_id` CHAR(36) NOT NULL,
  `subject_role` VARCHAR(40) NOT NULL,
  `issued_by` VARCHAR(80) NOT NULL DEFAULT 'migration_bridge',
  `scopes` JSON NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NOT NULL,
  `last_seen_at` DATETIME(6) NULL,
  `revoked_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_sessions_token_hash_uidx` (`token_hash`),
  KEY `api_sessions_subject_idx` (`subject_id`, `expires_at`),
  KEY `api_sessions_expiry_idx` (`expires_at`, `revoked_at`),
  CONSTRAINT `chk_api_session_role`
    CHECK (`subject_role` IN ('store_owner','store_member','courier','admin')),
  CONSTRAINT `chk_api_session_scopes_object`
    CHECK (JSON_TYPE(`scopes`) = 'ARRAY')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `realtime_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_key` CHAR(36) NOT NULL,
  `audience_type` VARCHAR(24) NOT NULL,
  `audience_id` CHAR(36) NULL,
  `event_type` VARCHAR(120) NOT NULL,
  `payload` JSON NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `realtime_events_event_key_uidx` (`event_key`),
  KEY `realtime_events_poll_idx` (`id`, `expires_at`),
  KEY `realtime_events_audience_idx` (`audience_type`, `audience_id`, `id`),
  CONSTRAINT `chk_realtime_audience_type`
    CHECK (`audience_type` IN ('store','courier','admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
