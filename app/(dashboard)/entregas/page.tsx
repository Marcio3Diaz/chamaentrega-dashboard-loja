import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { getOperationalRepository } from '@/lib/data/get-operational-repository'
import { LiveDeliveries } from '@/components/live-deliveries'

export default async function DeliveriesPage() {
  const { store } = await requireStore()
  const repository = getOperationalRepository()
  const deliveries = await repository.listDeliveriesByStore(store.id, 100)

  return <div className="deliveries-page">
    <div className="hero deliveries-hero">
      <div>
        <div className="eyebrow">OPERAÇÃO</div>
        <h1>Entregas</h1>
        <p className="subtle">Acompanhe a fila completa da loja em tempo real.</p>
      </div>
      <Link href="/entregas/nova" className="button button-gold">+ NOVA ENTREGA</Link>
    </div>
    <section className="card deliveries-list-card">
      <LiveDeliveries storeId={store.id} initialDeliveries={deliveries} />
    </section>
  </div>
}
