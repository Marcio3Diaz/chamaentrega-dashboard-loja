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

  const { data: walletRows } = await supabase.rpc('get_my_store_wallet', { p_store_id: store.id })
  const wallet = walletRows?.[0]
  const walletBalance = Number(wallet?.balance ?? 0)
  const walletReserved = Number(wallet?.reserved_balance ?? 0)
  const walletAvailable = Number(wallet?.available_balance ?? Math.max(walletBalance - walletReserved, 0))

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
    <section className="dashboard-hero target-hero dashboard-hero-v2">
      <div className="hero-content">
        <div className="eyebrow">CENTRAL OPERACIONAL · AO VIVO</div>
        <h1>Olá, <span>{store.name}.</span></h1>
        <p>Controle pedidos, entregadores, carteira e rotas em um único painel.</p>

        <div className="hero-status-row">
          <span className="hero-live-badge"><i /> Operação online</span>
          <span className="hero-date-badge">Atualização em tempo real</span>
        </div>
      </div>

      <div className="hero-command-center" aria-hidden="true">
        <div className="command-orbit orbit-one" />
        <div className="command-orbit orbit-two" />
        <div className="command-center-core">
          <Icon name="route" size={28}/>
        </div>
        <div className="command-stat stat-one"><strong>{active}</strong><small>em rota</small></div>
        <div className="command-stat stat-two"><strong>{couriers.length}</strong><small>online</small></div>
        <div className="command-stat stat-three"><strong>{waiting}</strong><small>buscando</small></div>
      </div>

      <Link href="/entregas/nova" className="button hero-cta hero-cta-v2">
        <span className="hero-cta-icon"><Icon name="plus" size={19}/></span>
        <span><strong>Nova entrega</strong><small>Publicar pedido pronto</small></span>
        <Icon name="arrow" size={18}/>
      </Link>
    </section>

    <section className="premium-metrics premium-metrics-v2">
      {metrics.map(metric => <article className={`premium-metric ${metric.tone}`} key={metric.label}>
        <div className="metric-icon"><Icon name={metric.icon} size={25}/></div>
        <div><div className="metric-label">{metric.label}</div><div className="metric-value">{metric.value}</div><div className="metric-note">{metric.note}</div></div>
        <div className="mini-bars" aria-hidden="true"><i/><i/><i/></div>
      </article>)}
    </section>

    <section className="dashboard-row main-row">
      <article className="premium-card deliveries-card premium-card-v2">
        <div className="premium-card-head">
          <div className="head-title"><span className="section-icon"><Icon name="box" size={22}/></span><div><h2>Entregas de hoje</h2><p>Atualização automática via Realtime</p></div></div>
          <Link href="/entregas" className="outline-link">Ver todas <Icon name="arrow" size={16}/></Link>
        </div>
        <LiveDeliveries storeId={store.id} initialDeliveries={deliveries} limit={5}/>
      </article>

      <article className="premium-card quick-card premium-card-v2">
        <div className="premium-card-head compact"><div className="head-title"><span className="section-icon lightning"><Icon name="lightning" size={22}/></span><div><h2>Ações rápidas</h2><p>Facilite sua operação do dia a dia</p></div></div></div>
        <div className="quick-grid">
          <Link href="/entregas/nova"><span className="quick-icon">+</span><span><strong>Pedido pronto</strong><small>Crie e publique uma entrega</small></span><b>›</b></Link>
          <Link href="/mapa"><span className="quick-icon"><Icon name="map" size={20}/></span><span><strong>Acompanhar corridas</strong><small>Veja entregadores e rotas no mapa</small></span><b>›</b></Link>
          <Link href="/entregadores"><span className="quick-icon"><Icon name="user" size={20}/></span><span><strong>Entregadores disponíveis</strong><small>{couriers.length} disponível na sua região</small></span><b>›</b></Link>
          <Link href="/financeiro"><span className="quick-icon"><Icon name="chart" size={20}/></span><span><strong>Financeiro</strong><small>Controle pagamentos das entregas</small></span><b>›</b></Link>
        </div>
      </article>
    </section>

    <section className="dashboard-row bottom-row">
      <article className="premium-card courier-card premium-card-v2">
        <div className="premium-card-head"><div className="head-title"><span className="section-icon"><Icon name="user" size={22}/></span><div><h2>Entregadores disponíveis</h2><p>Entregadores online na sua região</p></div></div><Link href="/entregadores" className="outline-link">Ver todos</Link></div>
        {firstCourier ? <div className="courier-line">
          <div className="courier-photo">{firstProfile?.avatar_url ? <img src={firstProfile.avatar_url} alt="" /> : (firstProfile?.full_name?.slice(0,1) ?? 'E')}</div>
          <span className="courier-live-dot"/>
          <div className="courier-copy"><strong>{firstProfile?.full_name ?? 'Entregador parceiro'}</strong><small>★ {Number(firstCourier.rating).toFixed(1)} &nbsp; {firstCourier.total_deliveries} entregas</small></div>
          <span className="online-tag">Online</span>
          <Link href="/entregadores" className="call-button"><Icon name="arrow" size={15}/>Ver entregadores</Link>
        </div> : <div className="premium-empty small">Nenhum entregador online agora.</div>}
      </article>

      <article className="premium-card finance-card premium-card-v2 finance-card-v2">
        <div className="premium-card-head"><div className="head-title"><span className="section-icon"><Icon name="money" size={22}/></span><div><h2>Carteira pré-paga</h2><p>Saldo para pagar suas entregas</p></div></div><Link href="/financeiro" className="outline-link">Recarregar</Link></div>
        <div className="finance-main"><div><strong>{currency(walletAvailable)}</strong><span>Saldo disponível</span></div><div className="finance-separator"/><div><strong>{currency(walletReserved)}</strong><span>Saldo reservado</span></div></div>
        <div className="finance-breakdown"><div><strong>{currency(walletBalance)}</strong><span>Saldo total</span></div><div><strong>{currency(gross)}</strong><span>Taxas de hoje</span></div><div className="positive"><strong>{walletAvailable > 0 ? 'ATIVA' : 'SEM SALDO'}</strong><span>Carteira</span></div></div>
      </article>

      <article className="premium-card activity-card premium-card-v2 activity-card-v2">
        <div className="premium-card-head compact"><div className="head-title"><span className="section-icon"><Icon name="pin" size={22}/></span><div><h2>Atividade em tempo real</h2><p>Acompanhe suas entregas no mapa</p></div></div><Link href="/mapa" className="outline-link">Abrir mapa</Link></div>
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
