-- Compatibilidade para instalações que já executaram a primeira versão de 001_core.sql.
-- Execute apenas se a tabela store_members existente ainda possuir a coluna id.

SET @has_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'store_members'
    AND column_name = 'id'
);

SET @sql := IF(
  @has_id > 0,
  'ALTER TABLE store_members DROP PRIMARY KEY, DROP INDEX uq_store_members_store_user, DROP COLUMN id, ADD PRIMARY KEY (store_id,user_id), ALTER COLUMN role SET DEFAULT ''operator''',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
