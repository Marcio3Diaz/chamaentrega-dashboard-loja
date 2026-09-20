import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { activeStatuses, currency } from '@/lib/format'
import type { Delivery } from '@/lib/types'
import { LiveDeliveries } from '@/components/live-deliveries'

export default async function OverviewPage() {
  const { store } = await requireStore()
  const supabase = await createClient()
  const start = new Date(); start.setHours(0,0,0,0)
  const { data } = await supabase.from('deliveries').select('*').eq('store_id', store.id).gte('created_at', start.toISOString()).order('created_at', { ascending:false })
  const deliveries = (data ?? []) as Delivery[]
  const active = deliveries.filter(d => activeStatuses.includes(d.status)).length
  const waiting = deliveries.filter(d => ['available','negotiating'].includes(d.status)).length
  const completed = deliveries.filter(d => d.status === 'completed').length
  const totalFees = deliveries.filter(d => d.status === 'completed').reduce((sum,d) => sum + Number(d.delivery_fee ?? 0), 0)
  const { count: onlineCouriers } = await supabase.from('couriers').select('id', { count:'exact', head:true }).eq('is_online', true).eq('is_available', true)

  return <>
    <div className="hero"><div><div className="eyebrow">Operação em tempo real</div><h1>Olá, {store.name}.</h1><p className="subtle">Veja o que está acontecendo agora e publique um pedido quando ele estiver pronto.</p></div><Link href="/entregas/nova" className="button button-gold">+ NOVA ENTREGA</Link></div>
    <section className="grid-metrics">
      <div className="metric gold"><div className="metric-label">Entregas hoje</div><div className="metric-value">{deliveries.length}</div><div className="metric-note">Pedidos criados desde 00:00</div></div>
      <div className="metric"><div className="metric-label">Em andamento</div><div className="metric-value">{active}</div><div className="metric-note">Entregas já aceitas</div></div>
      <div className="metric"><div className="metric-label">Buscando entregador</div><div className="metric-value">{waiting}</div><div className="metric-note">Ofertas abertas agora</div></div>
      <div className="metric green"><div className="metric-label">Concluídas</div><div className="metric-value">{completed}</div><div className="metric-note">Custo: {currency(totalFees)}</div></div>
    </section>
    <div className="split">
      <section className="card"><div className="card-head"><div><h2>Entregas de hoje</h2><div className="subtle">Atualização automática via Realtime</div></div><Link href="/entregas" className="button button-dark">VER TODAS</Link></div><LiveDeliveries storeId={store.id} initialDeliveries={deliveries} limit={7}/></section>
      <aside className="card"><div className="card-head"><h2>Ações rápidas</h2></div><div className="card-body quick">
        <Link href="/entregas/nova"><strong>Pedido pronto</strong><span>Crie e publique uma entrega.</span></Link>
        <Link href="/entregas"><strong>Acompanhar corridas</strong><span>Veja cada etapa em tempo real.</span></Link>
        <Link href="/entregadores"><strong>Entregadores disponíveis</strong><span>{onlineCouriers ?? 0} visíveis na sua rede agora.</span></Link>
        <Link href="/financeiro"><strong>Financeiro</strong><span>Controle pagamentos das entregas.</span></Link>
      </div></aside>
    </div>
  </>
}
