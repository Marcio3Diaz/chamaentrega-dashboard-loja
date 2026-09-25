import { getDatabaseProvider } from '@/lib/database/provider'
import type { OperationalRepository } from '@/lib/data/operational-repository'
import { SupabaseOperationalRepository } from '@/lib/data/supabase-operational-repository'
import { MysqlOperationalRepository } from '@/lib/data/mysql-operational-repository'

export function getOperationalRepository(): OperationalRepository {
  return getDatabaseProvider() === 'mysql'
    ? new MysqlOperationalRepository()
    : new SupabaseOperationalRepository()
}
