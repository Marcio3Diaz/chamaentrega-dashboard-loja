import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { activeStatuses, currency, shortId, statusLabel } from '@/lib/format'
import type { Delivery } from '@/lib/types'
import { LiveDeliveries } from '@/components/live-deliveries'
import { DashboardClock } from '@/components/dashboard-clock'
import { DashboardLiveMap } from '@/components/dashboard-live-map'
import { Icon } from '@/components/icon'

function minutesBetween(start: string, end: string | null) {
  if (!end) return null
  const value = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday:'short' })
    .format(date)
    .replace('.','')
    .replace(/^./, value => value.toUpperCase())
}

export default async function OverviewPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const now = new Date()
  const startToday = new Date(now)
  startToday.setHours(0,0,0,0)

  const startWeek = new Date(startToday)
  startWeek.setDate(startWeek.getDate() - 6)

  const [{ data: todayData }, { data: weekData }] = await Promise.all([
    supabase
      .from('deliveries')
      .select('*')
      .eq('store_id', store.id)
      .gte('created_at', startToday.toISOString())
      .order('created_at', { ascending:false }),
    supabase
      .from('deliveries')
      .select('*')
      .eq('store_id', store.id)
      .gte('created_at', startWeek.toISOString())
      .order('created_at', { ascending:false }),
  ])

  const deliveries = (todayData ?? []) as Delivery[]
  const weekDeliveries = (weekData ?? []) as Delivery[]

  const active = deliveries.filter(item => activeStatuses.includes(item.status)).length
  const waiting = deliveries.filter(item => ['available','negotiating'].includes(item.status)).length
  const completed = deliveries.filter(item => item.status === 'completed').length
  const cancelled = deliveries.filter(item => item.status === 'cancelled').length

  const billed = deliveries.filter(item => !['draft','cancelled','expired'].includes(item.status))
  const gross = billed.reduce((sum,item) => sum + Number(item.delivery_fee ?? 0),0)

  const completedTimes = deliveries
    .filter(item => item.status === 'completed')
    .map(item => minutesBetween(item.accepted_at ?? item.created_at,item.completed_at))
    .filter((value): value is number => value != null)

  const averageMinutes = completedTimes.length
    ? Math.round(completedTimes.reduce((sum,value) => sum + value,0) / completedTimes.length)
    : 0

  const { data: walletRows } = await supabase.rpc('get_my_store_wallet', { p_store_id: store.id })
  const wallet = walletRows?.[0]
  const walletBalance = Number(wallet?.balance ?? 0)
  const walletReserved = Number(wallet?.reserved_balance ?? 0)
  const walletAvailable = Number(wallet?.available_balance ?? Math.max(walletBalance - walletReserved,0))

  const { data: couriersData } = await supabase
    .from('couriers')
    .select('id,is_online,is_available')
  const couriers = couriersData ?? []
  const couriersOnline = couriers.filter(item => item.is_online).length

  const metrics = [
    { icon:'box', label:'Pedidos hoje', value:String(deliveries.length), note:`${completed} concluída${completed === 1 ? '' : 's'}`, tone:'gold' },
    { icon:'truck', label:'Entregas em andamento', value:String(active), note:`${waiting} buscando entregador`, tone:'blue' },
    { icon:'check', label:'Entregas concluídas', value:String(completed), note: deliveries.length ? `Taxa de sucesso ${Math.round((completed / deliveries.length) * 100)}%` : 'Sem pedidos hoje', tone:'green' },
    { icon:'clock', label:'Tempo médio de entrega', value: averageMinutes ? `${averageMinutes} min` : '—', note:'Com base nas concluídas hoje', tone:'red' },
    { icon:'users', label:'Entregadores ativos', value:`${couriersOnline} / ${couriers.length}`, note:`${Math.max(couriers.length - couriersOnline,0)} indisponíveis`, tone:'purple' },
    { icon:'money', label:'Faturamento hoje', value:currency(gross), note:`${currency(walletAvailable)} na carteira`, tone:'gold' },
  ]

  const filterCounts = {
    all: deliveries.length,
    waiting: deliveries.filter(item => ['draft','available','negotiating'].includes(item.status)).length,
    active,
    completed,
    cancelled,
  }

  const activeMapDeliveries = (todayData ?? [])
    .filter((item:any) => activeStatuses.includes(item.status) || ['available','negotiating'].includes(item.status))
    .map((item:any) => ({
      id:item.id,
      status:item.status,
      latitude:item.delivery_latitude == null ? null : Number(item.delivery_latitude),
      longitude:item.delivery_longitude == null ? null : Number(item.delivery_longitude),
    }))

  const days = Array.from({ length:7 },(_,index) => {
    const date = new Date(startWeek)
    date.setDate(startWeek.getDate() + index)
    const next = new Date(date)
    next.setDate(date.getDate() + 1)

    const rows = weekDeliveries.filter(item => {
      const created = new Date(item.created_at)
      return created >= date && created < next && !['draft','cancelled','expired'].includes(item.status)
    })

    return {
      label:dayLabel(date),
      value:rows.reduce((sum,item) => sum + Number(item.delivery_fee ?? 0),0),
    }
  })
  const maxDayValue = Math.max(...days.map(item => item.value),1)
  const weekGross = days.reduce((sum,item) => sum + item.value,0)

  const hourBuckets = Array.from({ length:8 },(_,index) => {
    const startHour = index * 3
    const count = deliveries.filter(item => {
      const hour = new Date(item.created_at).getHours()
      return hour >= startHour && hour < startHour + 3
    }).length
    return { label:String(startHour).padStart(2,'0') + 'h', count }
  })
  const maxHourCount = Math.max(...hourBuckets.map(item => item.count),1)
  const linePoints = hourBuckets.map((item,index) => {
    const x = 8 + (index * 84 / Math.max(hourBuckets.length - 1,1))
    const y = 88 - (item.count / maxHourCount) * 64
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="reference-dashboard">
      <section
        className="reference-hero generic-hero-banner official-png-banner"
        style={{ backgroundImage: "url('/images/chamaentrega-dashboard-banner-generic.png')" }}
        aria-label="Sua loja no ChamaEntrega"
      >
        <DashboardClock location={store.city && store.state ? `${store.city} - ${store.state}` : 'Rio de Janeiro - RJ'} />
      </section>

      <section className="reference-metrics">
        {metrics.map(metric => (
          <article className={`reference-metric ${metric.tone}`} key={metric.label}>
            <span className="reference-metric-icon"><Icon name={metric.icon} size={25}/></span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <span>{metric.note}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="reference-live-grid">
        <article className="reference-panel reference-orders-panel">
          <div className="reference-panel-head">
            <div className="reference-title-with-icon">
              <span><Icon name="box" size={20}/></span>
              <div><h2>Pedidos em tempo real</h2><p>Acompanhe todos os pedidos da sua loja</p></div>
            </div>
            <Link href="/entregas" className="reference-outline-button">Ver todos</Link>
          </div>

          <div className="reference-order-filters">
            <span className="active">Todos <b>{filterCounts.all}</b></span>
            <span>Aguardando <b>{filterCounts.waiting}</b></span>
            <span>Em andamento <b>{filterCounts.active}</b></span>
            <span>Concluídos <b>{filterCounts.completed}</b></span>
            <span>Cancelados <b>{filterCounts.cancelled}</b></span>
          </div>

          <LiveDeliveries storeId={store.id} initialDeliveries={deliveries} limit={6}/>
        </article>

        <article className="reference-panel reference-map-panel">
          <div className="reference-panel-head">
            <div className="reference-title-with-icon">
              <span><Icon name="map" size={20}/></span>
              <div><h2>Mapa de entregas ao vivo</h2><p>Rotas e destinos da operação</p></div>
            </div>
            <Link href="/mapa" className="reference-outline-button">Ver todas</Link>
          </div>

          <DashboardLiveMap
            storeLatitude={store.latitude}
            storeLongitude={store.longitude}
            deliveries={activeMapDeliveries}
          />
        </article>
      </section>

      <section className="reference-analytics-grid">
        <article className="reference-panel reference-analytics-card">
          <div className="reference-analytics-head">
            <div><Icon name="chart" size={19}/><span><strong>Faturamento</strong><small>Últimos 7 dias</small></span></div>
            <span>7 dias</span>
          </div>
          <div className="reference-analytics-total">{currency(weekGross)}</div>
          <div className="reference-bars">
            {days.map(item => (
              <div key={item.label}>
                <i style={{ height:`${Math.max(10,(item.value / maxDayValue) * 72)}px` }} />
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="reference-panel reference-analytics-card">
          <div className="reference-analytics-head">
            <div><Icon name="clock" size={19}/><span><strong>Pedidos por horário</strong><small>Hoje</small></span></div>
            <span>Hoje</span>
          </div>
          <div className="reference-analytics-total">{deliveries.length} pedidos</div>
          <div className="reference-line-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={linePoints} />
            </svg>
            <div>{hourBuckets.map(item => <small key={item.label}>{item.label}</small>)}</div>
          </div>
        </article>

        <article className="reference-panel reference-analytics-card">
          <div className="reference-analytics-head">
            <div><Icon name="box" size={19}/><span><strong>Produtos mais pedidos</strong><small>Cardápio</small></span></div>
          </div>
          <div className="reference-products-empty">
            <Icon name="store" size={28}/>
            <strong>Integração com cardápio</strong>
            <small>Os produtos mais vendidos aparecerão aqui quando os itens dos pedidos estiverem integrados.</small>
          </div>
        </article>

        <article className="reference-panel reference-analytics-card">
          <div className="reference-analytics-head">
            <div><Icon name="activity" size={19}/><span><strong>Últimas atividades</strong><small>Operação recente</small></span></div>
            <Link href="/entregas">Ver todas</Link>
          </div>
          <div className="reference-activity-list">
            {deliveries.slice(0,5).map(item => (
              <div key={item.id}>
                <span className={item.status === 'completed' ? 'done' : activeStatuses.includes(item.status) ? 'live' : 'wait'}>
                  <Icon name={item.status === 'completed' ? 'check' : activeStatuses.includes(item.status) ? 'truck' : 'clock'} size={13}/>
                </span>
                <strong>Pedido #{shortId(item.id)}</strong>
                <small>{statusLabel[item.status] ?? item.status}</small>
              </div>
            ))}
            {!deliveries.length ? <div className="reference-activity-empty">Nenhuma atividade hoje.</div> : null}
          </div>
        </article>
      </section>
    </div>
  )
}
