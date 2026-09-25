import { getDatabaseProvider } from '@/lib/database/provider'
import type { OperationalRepository } from '@/lib/data/operational-repository'
import { SupabaseOperationalRepository } from '@/lib/data/supabase-operational-repository'
import { MysqlOperationalRepository } from '@/lib/data/mysql-operational-repository'
import { MysqlBridgeOperationalRepository } from '@/lib/data/mysql-bridge-operational-repository'

export function getOperationalRepository(): OperationalRepository {
  if (getDatabaseProvider() !== 'mysql') {
    return new SupabaseOperationalRepository()
  }

  const syncFromSupabase =
    process.env.MYSQL_SYNC_FROM_SUPABASE?.trim().toLowerCase() === 'true'

  return syncFromSupabase
    ? new MysqlBridgeOperationalRepository()
    : new MysqlOperationalRepository()
}
