import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LiveDeliveries } from '@/components/live-deliveries'
import type { Delivery } from '@/lib/types'

export default async function DeliveriesPage() {
  const { store } = await requireStore()
  const supabase = await createClient()
  const { data } = await supabase.from('deliveries').select('*').eq('store_id', store.id).order('created_at',{ascending:false}).limit(100)
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
      <LiveDeliveries storeId={store.id} initialDeliveries={(data ?? []) as Delivery[]} />
    </section>
  </div>
}
