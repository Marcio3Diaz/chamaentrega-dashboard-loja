-- ChamaEntrega MySQL compatibility fixes
-- Safe forward migration for development databases created before the identity fix.

ALTER TABLE `courier_push_dispatches`
  MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT;
