-- Alinha bancos MySQL já existentes ao schema operacional atual do Supabase.
-- Compatível com MySQL sem suporte a ADD COLUMN IF NOT EXISTS.

SET @schema := DATABASE();

SET @sql := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=@schema AND table_name='profiles' AND column_name='phone'
  ),
  'SELECT 1',
  'ALTER TABLE profiles ADD COLUMN phone VARCHAR(40) NULL AFTER full_name'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='zip_code'),'SELECT 1','ALTER TABLE stores ADD COLUMN zip_code VARCHAR(30) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='street'),'SELECT 1','ALTER TABLE stores ADD COLUMN street VARCHAR(180) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='street_number'),'SELECT 1','ALTER TABLE stores ADD COLUMN street_number VARCHAR(40) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='complement'),'SELECT 1','ALTER TABLE stores ADD COLUMN complement VARCHAR(180) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='neighborhood'),'SELECT 1','ALTER TABLE stores ADD COLUMN neighborhood VARCHAR(120) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='organization_id'),'SELECT 1','ALTER TABLE stores ADD COLUMN organization_id CHAR(36) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='moderated_at'),'SELECT 1','ALTER TABLE stores ADD COLUMN moderated_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='moderated_by'),'SELECT 1','ALTER TABLE stores ADD COLUMN moderated_by CHAR(36) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='stores' AND column_name='approved_at'),'SELECT 1','ALTER TABLE stores ADD COLUMN approved_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='rating'),'SELECT 1','ALTER TABLE couriers ADD COLUMN rating DECIMAL(4,2) NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='total_deliveries'),'SELECT 1','ALTER TABLE couriers ADD COLUMN total_deliveries INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='current_latitude'),'SELECT 1','ALTER TABLE couriers ADD COLUMN current_latitude DECIMAL(10,7) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='current_longitude'),'SELECT 1','ALTER TABLE couriers ADD COLUMN current_longitude DECIMAL(10,7) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='last_location_at'),'SELECT 1','ALTER TABLE couriers ADD COLUMN last_location_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='moderation_status'),'SELECT 1',"ALTER TABLE couriers ADD COLUMN moderation_status VARCHAR(40) NOT NULL DEFAULT 'pending'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='moderation_reason'),'SELECT 1','ALTER TABLE couriers ADD COLUMN moderation_reason TEXT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='moderated_at'),'SELECT 1','ALTER TABLE couriers ADD COLUMN moderated_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='moderated_by'),'SELECT 1','ALTER TABLE couriers ADD COLUMN moderated_by CHAR(36) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='couriers' AND column_name='approved_at'),'SELECT 1','ALTER TABLE couriers ADD COLUMN approved_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='deliveries' AND column_name='seconds_to_accept'),'SELECT 1','ALTER TABLE deliveries ADD COLUMN seconds_to_accept INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='deliveries' AND column_name='published_at'),'SELECT 1','ALTER TABLE deliveries ADD COLUMN published_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='deliveries' AND column_name='expires_at'),'SELECT 1','ALTER TABLE deliveries ADD COLUMN expires_at DATETIME(3) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='deliveries' AND column_name='courier_batch_id'),'SELECT 1','ALTER TABLE deliveries ADD COLUMN courier_batch_id CHAR(36) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='deliveries' AND column_name='target_courier_id'),'SELECT 1','ALTER TABLE deliveries ADD COLUMN target_courier_id CHAR(36) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@schema AND table_name='deliveries' AND column_name='dispatch_route_group_id'),'SELECT 1','ALTER TABLE deliveries ADD COLUMN dispatch_route_group_id CHAR(36) NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
