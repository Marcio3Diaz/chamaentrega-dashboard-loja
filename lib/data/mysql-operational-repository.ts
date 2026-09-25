import type { Delivery, Store } from '@/lib/types'
import type {
  OperationalRepository,
  StoreOrderRecord,
  CourierOperationalRecord,
  CourierProfileRecord,
} from '@/lib/data/operational-repository'

function unavailable(): never {
  throw new Error(
    'MySQL foi selecionado, mas o driver mysql2 ainda não está instalado. ' +
      'Mantenha DATABASE_PROVIDER=supabase até concluir a instalação do driver e do lockfile.',
  )
}

export class MysqlOperationalRepository implements OperationalRepository {
  async listStoresForUser(_userId: string): Promise<Store[]> {
    return unavailable()
  }

  async listDeliveriesByStore(_storeId: string, _limit = 100): Promise<Delivery[]> {
    return unavailable()
  }

  async listDeliveriesSince(_storeId: string, _sinceIso: string, _limit = 500): Promise<Delivery[]> {
    return unavailable()
  }

  async listStoreOrders(_storeId: string, _limit = 250): Promise<StoreOrderRecord[]> {
    return unavailable()
  }

  async listCouriers(): Promise<CourierOperationalRecord[]> {
    return unavailable()
  }

  async listCourierProfilesByIds(_ids: string[]): Promise<CourierProfileRecord[]> {
    return unavailable()
  }
}
