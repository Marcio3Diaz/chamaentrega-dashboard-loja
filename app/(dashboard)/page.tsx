import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { activeStatuses, currency, shortId, statusLabel } from '@/lib/format'
import type { Delivery } from '@/lib/types'
import { LiveDeliveries } from '@/components/live-deliveries'
import { Icon } from '@/components/icon'

export default async function OverviewPage() {
  const { store } = await requireStore()
  const supabase = await createClient()
  const start = new Date(); start.setHours(0,0,0,0)

  const { data } = await supabase
    .from('deliveries').select('*').eq('store_id', store.id)
    .gte('created_at', start.toISOString()).order('created_at', { ascending:false })

  const deliveries = (data ?? []) as Delivery[]
  const active = deliveries.filter(d => activeStatuses.includes(d.status)).length
  const waiting = deliveries.filter(d => ['available','negotiating'].includes(d.status)).length
  const completed = deliveries.filter(d => d.status === 'completed').length
  const billed = deliveries.filter(d => !['draft','cancelled','expired'].includes(d.status))
  const gross = billed.reduce((sum,d) => sum + Number(d.delivery_fee ?? 0), 0)
  const activeDelivery = deliveries.find(d => activeStatuses.includes(d.status)) ?? deliveries[0] ?? null

  const { data: couriersData } = await supabase
    .from('couriers')
    .select('id,rating,total_deliveries,is_online,is_available')
    .eq('is_online', true).eq('is_available', true)

  const couriers = couriersData ?? []
  const courierIds = couriers.map(c => c.id)
  const { data: profilesData } = courierIds.length
    ? await supabase.from('profiles').select('id,full_name,avatar_url').in('id', courierIds)
    : { data: [] as { id:string; full_name:string|null; avatar_url:string|null }[] }

  const firstCourier = couriers[0]
  const firstProfile = profilesData?.find(p => p.id === firstCourier?.id)

  const metrics = [
    { icon:'box', label:'Entregas hoje', value:String(deliveries.length), note:'Pedidos criados desde 00:00', tone:'gold' },
    { icon:'truck', label:'Em andamento', value:String(active), note:'Entregas já aceitas', tone:'blue' },
    { icon:'clock', label:'Buscando entregador', value:String(waiting), note:'Ofertas abertas agora', tone:'gray' },
    { icon:'check', label:'Concluídas', value:String(completed), note:'Entregas finalizadas hoje', tone:'green' },
    { icon:'money', label:'Faturamento hoje', value:currency(gross), note:'Total em taxas de entrega', tone:'gold' },
  ]

  return <>
    <section className="dashboard-banner" aria-label="ChamaEntrega Entregador">
      <img
        src="/images/chamaentrega-dashboard-banner.webp"
        alt="Banner ChamaEntrega Entregador"
        className="dashboard-banner-image"
      />
    </section>

    <section className="premium-metrics">
      {metrics.map(metric => <article className={`premium-metric ${metric.tone}`} key={metric.label}>
        <div className="metric-icon"><Icon name={metric.icon} size={25}/></div>
        <div><div className="metric-label">{metric.label}</div><div className="metric-value">{metric.value}</div><div className="metric-note">{metric.note}</div></div>
        <div className="mini-bars" aria-hidden="true"><i/><i/><i/></div>
      </article>)}
    </section>

    <section className="dashboard-row main-row">
      <article className="premium-card deliveries-card">
        <div className="premium-card-head">
          <div className="head-title"><span className="section-icon"><Icon name="box" size={22}/></span><div><h2>Entregas de hoje</h2><p>Atualização automática via Realtime</p></div></div>
          <Link href="/entregas" className="outline-link">Ver todas <Icon name="arrow" size={16}/></Link>
        </div>
        <LiveDeliveries storeId={store.id} initialDeliveries={deliveries} limit={5}/>
      </article>

      <article className="premium-card quick-card">
        <div className="premium-card-head compact"><div className="head-title"><span className="section-icon lightning"><Icon name="lightning" size={22}/></span><div><h2>Ações rápidas</h2><p>Facilite sua operação do dia a dia</p></div></div></div>
        <div className="quick-grid">
          <Link href="/entregas/nova"><span className="quick-icon">+</span><span><strong>Pedido pronto</strong><small>Crie e publique uma entrega</small></span><b>›</b></Link>
          <Link href="/entregas"><span className="quick-icon"><Icon name="map" size={20}/></span><span><strong>Acompanhar corridas</strong><small>Veja cada etapa em tempo real</small></span><b>›</b></Link>
          <Link href="/entregadores"><span className="quick-icon"><Icon name="user" size={20}/></span><span><strong>Entregadores disponíveis</strong><small>{couriers.length} disponível na sua região</small></span><b>›</b></Link>
          <Link href="/financeiro"><span className="quick-icon"><Icon name="chart" size={20}/></span><span><strong>Financeiro</strong><small>Controle pagamentos das entregas</small></span><b>›</b></Link>
        </div>
      </article>
    </section>

    <section className="dashboard-row bottom-row">
      <article className="premium-card courier-card">
        <div className="premium-card-head"><div className="head-title"><span className="section-icon"><Icon name="user" size={22}/></span><div><h2>Entregadores disponíveis</h2><p>Entregadores online na sua região</p></div></div><Link href="/entregadores" className="outline-link">Ver todos</Link></div>
        {firstCourier ? <div className="courier-line">
          <div className="courier-photo">{firstProfile?.avatar_url ? <img src={firstProfile.avatar_url} alt="" /> : (firstProfile?.full_name?.slice(0,1) ?? 'E')}</div>
          <span className="courier-live-dot"/>
          <div className="courier-copy"><strong>{firstProfile?.full_name ?? 'Entregador parceiro'}</strong><small>★ {Number(firstCourier.rating).toFixed(1)} &nbsp; {firstCourier.total_deliveries} entregas</small></div>
          <span className="online-tag">Online</span>
          <button className="call-button"><Icon name="arrow" size={15}/>Chamar</button>
        </div> : <div className="premium-empty small">Nenhum entregador online agora.</div>}
      </article>

      <article className="premium-card finance-card">
        <div className="premium-card-head"><div className="head-title"><span className="section-icon"><Icon name="money" size={22}/></span><div><h2>Resumo financeiro</h2><p>Suas movimentações de hoje</p></div></div><Link href="/financeiro" className="outline-link">Ver detalhes</Link></div>
        <div className="finance-main"><div><strong>{currency(gross)}</strong><span>Faturamento hoje</span></div><div className="finance-separator"/><div><strong>{billed.length}</strong><span>Entregas cobradas</span></div></div>
        <div className="finance-breakdown"><div><strong>{currency(billed.length ? gross/billed.length : 0)}</strong><span>Custo médio</span></div><div><strong>{currency(0)}</strong><span>Taxas e ajustes</span></div><div className="positive"><strong>{currency(gross)}</strong><span>Resultado</span></div></div>
      </article>

      <article className="premium-card activity-card">
        <div className="premium-card-head compact"><div className="head-title"><span className="section-icon"><Icon name="pin" size={22}/></span><div><h2>Atividade em tempo real</h2><p>Acompanhe suas entregas no mapa</p></div></div></div>
        <div className="fake-map">
          <svg viewBox="0 0 360 140" preserveAspectRatio="none" aria-hidden="true">
            <path className="map-street" d="M0 30 75 55 130 28 195 62 255 35 360 65M0 100 70 75 145 112 220 82 300 118 360 92M45 0 75 140M155 0 180 140M285 0 255 140"/>
            <polyline className="route-line" points="36,90 86,70 105,42 170,62 230,46 278,75 330,58"/>
          </svg>
          <span className="map-bike"><Icon name="truck" size={18}/></span>
          <span className="map-pin"><Icon name="pin" size={18}/></span>
          <div className="map-delivery"><span className="map-small-icon"><Icon name="box" size={15}/></span><span><strong>{activeDelivery ? `Entrega #${shortId(activeDelivery.id)}` : 'Sem entrega ativa'}</strong><small>{activeDelivery ? (statusLabel[activeDelivery.status] ?? activeDelivery.status) : 'Aguardando nova corrida'}</small></span><b>→</b></div>
          <div className="map-city">Rio de Janeiro</div>
        </div>
      </article>
    </section>
  </>
}
