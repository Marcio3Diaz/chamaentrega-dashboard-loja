-- Preserve capacities from PostgreSQL TEXT fields that can exceed 255 characters.

ALTER TABLE `profiles`
  MODIFY COLUMN `avatar_url` TEXT NULL;

ALTER TABLE `stores`
  MODIFY COLUMN `logo_url` TEXT NULL;

ALTER TABLE `courier_verifications`
  MODIFY COLUMN `cnh_front_path` VARCHAR(500) NULL,
  MODIFY COLUMN `cnh_back_path` VARCHAR(500) NULL,
  MODIFY COLUMN `selfie_path` VARCHAR(500) NULL,
  MODIFY COLUMN `vehicle_document_path` VARCHAR(500) NULL;

ALTER TABLE `delivery_payments`
  MODIFY COLUMN `proof_url` TEXT NULL;

ALTER TABLE `store_wallet_topups`
  MODIFY COLUMN `payment_link_url` TEXT NULL,
  MODIFY COLUMN `qr_code_image_url` TEXT NULL;

ALTER TABLE `courier_push_tokens`
  MODIFY COLUMN `token` VARCHAR(512) NOT NULL;
