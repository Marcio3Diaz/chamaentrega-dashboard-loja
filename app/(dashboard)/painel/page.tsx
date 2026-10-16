import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { activeStatuses, currency, shortId, statusLabel } from '@/lib/format'
import type { Delivery } from '@/lib/types'
import { LiveDeliveries } from '@/components/live-deliveries'
import { DashboardClock } from '@/components/dashboard-clock'
import { DashboardLiveMap } from '@/components/dashboard-live-map'
import { Icon } from '@/components/icon'
import { migrationStoreDeliveriesWithFallback, migrationStoreWalletWithFallback } from '@/lib/migration-api'

function minutesBetween(start:string,end:string | null) {
  if (!end) return null
  const value = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function dayLabel(date:Date) {
  return new Intl.DateTimeFormat('pt-BR',{ weekday:'short' })
    .format(date)
    .replace('.','')
    .replace(/^./,value => value.toUpperCase())
}

function onlyTime(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{ hour:'2-digit',minute:'2-digit' }).format(new Date(value))
}

export default async function OverviewPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const now = new Date()
  const startToday = new Date(now)
  startToday.setHours(0,0,0,0)

  const startWeek = new Date(startToday)
  startWeek.setDate(startWeek.getDate() - 6)

  const [todayResult,weekResult] = await Promise.all([
    migrationStoreDeliveriesWithFallback(
      store.id,
      async () => {
        const { data,error } = await supabase
          .from('deliveries')
          .select('*')
          .eq('store_id',store.id)
          .gte('created_at',startToday.toISOString())
          .order('created_at',{ ascending:false })

        if (error) throw error
        return (data ?? []) as Delivery[]
      },
      { since:startToday.toISOString(),limit:250,label:'dashboard-today-v2' },
    ),
    migrationStoreDeliveriesWithFallback(
      store.id,
      async () => {
        const { data,error } = await supabase
          .from('deliveries')
          .select('*')
          .eq('store_id',store.id)
          .gte('created_at',startWeek.toISOString())
          .order('created_at',{ ascending:false })

        if (error) throw error
        return (data ?? []) as Delivery[]
      },
      { since:startWeek.toISOString(),limit:1000,label:'dashboard-week-v2' },
    ),
  ])

  const deliveries = todayResult.deliveries
  const weekDeliveries = weekResult.deliveries

  const waitingStatuses = ['draft','available','negotiating']
  const active = deliveries.filter(item => activeStatuses.includes(item.status)).length
  const waiting = deliveries.filter(item => waitingStatuses.includes(item.status)).length
  const completed = deliveries.filter(item => item.status === 'completed').length
  const cancelled = deliveries.filter(item => item.status === 'cancelled').length
  const billed = deliveries.filter(item => !['draft','cancelled','expired'].includes(item.status))
  const gross = billed.reduce((sum,item) => sum + Number(item.delivery_fee ?? 0),0)

  const completedTimes = deliveries
    .filter(item => item.status === 'completed')
    .map(item => minutesBetween(item.accepted_at ?? item.created_at,item.completed_at))
    .filter((value):value is number => value != null)

  const averageMinutes = completedTimes.length
    ? Math.round(completedTimes.reduce((sum,value) => sum + value,0) / completedTimes.length)
    : 0

  const completionRate = deliveries.length
    ? Math.round((completed / deliveries.length) * 100)
    : 0

  const { wallet } = await migrationStoreWalletWithFallback(
    store.id,
    async () => {
      const { data:walletRows,error } = await supabase.rpc(
        'get_my_store_wallet',
        { p_store_id:store.id },
      )
      if (error) throw error
      const row = walletRows?.[0]
      const balance = Number(row?.balance ?? 0)
      const reservedBalance = Number(row?.reserved_balance ?? 0)

      return {
        storeId:store.id,
        walletId:row?.wallet_id ?? row?.id ?? null,
        balance,
        reservedBalance,
        availableBalance:Number(row?.available_balance ?? Math.max(balance - reservedBalance,0)),
        updatedAt:row?.updated_at ?? null,
      }
    },
    { label:'dashboard-wallet-v2' },
  )

  const walletAvailable = wallet.availableBalance
  const walletReserved = wallet.reservedBalance

  const { data:couriersData } = await supabase
    .from('couriers')
    .select('id,is_online,is_available')

  const couriers = couriersData ?? []
  const couriersOnline = couriers.filter(item => item.is_online).length
  const couriersAvailable = couriers.filter(item => item.is_online && item.is_available).length

  const kpis = [
    {
      icon:'box',
      label:'Pedidos hoje',
      value:String(deliveries.length),
      note:`${completed} concluído${completed === 1 ? '' : 's'} · ${cancelled} cancelado${cancelled === 1 ? '' : 's'}`,
      tone:'gold',
    },
    {
      icon:'clock',
      label:'Aguardando entregador',
      value:String(waiting),
      note:waiting ? 'Requer atenção da operação' : 'Nenhuma entrega aguardando',
      tone:'gold',
    },
    {
      icon:'truck',
      label:'Em rota',
      value:String(active),
      note:averageMinutes ? `Tempo médio hoje: ${averageMinutes} min` : 'Sem tempo médio calculado',
      tone:'blue',
    },
    {
      icon:'check',
      label:'Concluídos',
      value:String(completed),
      note:deliveries.length ? `Taxa de conclusão: ${completionRate}%` : 'Sem pedidos hoje',
      tone:'green',
    },
    {
      icon:'users',
      label:'Entregadores online',
      value:`${couriersOnline}`,
      note:`${couriersAvailable} disponível${couriersAvailable === 1 ? '' : 'is'} agora`,
      tone:'purple',
    },
  ]

  const activeMapDeliveries = deliveries
    .filter(item => activeStatuses.includes(item.status) || ['available','negotiating'].includes(item.status))
    .map(item => ({
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

  return (
    <div className="store-dashboard-v2">
      <section className="ops-hero">
        <div className="ops-hero-copy">
          <span className="ops-kicker"><i /> Central de operação</span>
          <h1>{store.name}</h1>
          <p>
            Acompanhe pedidos, entregadores e entregas em tempo real. O que exige ação fica no topo; relatórios ficam em segundo plano.
          </p>
          <div className="ops-hero-actions">
            <Link href="/entregas/nova" className="ops-primary-action">
              <Icon name="plus" size={17}/>
              Nova entrega
            </Link>
            <Link href="/pedidos" className="ops-secondary-action">
              <Icon name="box" size={16}/>
              Abrir pedidos
            </Link>
            <Link href="/mapa" className="ops-secondary-action">
              <Icon name="map" size={16}/>
              Ver mapa
            </Link>
          </div>
        </div>

        <DashboardClock
          location={store.city && store.state ? `${store.city} - ${store.state}` : 'Rio de Janeiro - RJ'}
        />
      </section>

      {waiting > 0 ? (
        <section className="ops-alert">
          <span><Icon name="lightning" size={18}/></span>
          <div>
            <strong>{waiting} entrega{waiting === 1 ? '' : 's'} aguardando entregador</strong>
            <small>Priorize os pedidos que já estão prontos para evitar aumento do tempo de entrega.</small>
          </div>
          <Link href="/pedidos">ABRIR FILA</Link>
        </section>
      ) : null}

      {walletAvailable < 30 ? (
        <section className="ops-alert wallet">
          <span><Icon name="money" size={18}/></span>
          <div>
            <strong>Saldo disponível baixo</strong>
            <small>Você tem {currency(walletAvailable)} disponível para novas entregas.</small>
          </div>
          <Link href="/financeiro">VER CARTEIRA</Link>
        </section>
      ) : null}

      <section className="ops-kpis">
        {kpis.map(metric => (
          <article className={`ops-kpi ${metric.tone}`} key={metric.label}>
            <div className="ops-kpi-top">
              <span className="ops-kpi-icon"><Icon name={metric.icon} size={18}/></span>
              <small>{metric.label}</small>
            </div>
            <strong>{metric.value}</strong>
            <p>{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="ops-main-grid">
        <article className="ops-panel">
          <div className="ops-panel-head">
            <div className="ops-panel-title">
              <span><Icon name="box" size={18}/></span>
              <div>
                <h2>Fila operacional</h2>
                <p>Pedidos e entregas mais recentes da loja</p>
              </div>
            </div>
            <Link href="/pedidos" className="ops-panel-link">Ver todos</Link>
          </div>

          <div className="ops-count-chips">
            <span className="ops-count-chip">Hoje <b>{deliveries.length}</b></span>
            <span className="ops-count-chip attention">Aguardando <b>{waiting}</b></span>
            <span className="ops-count-chip live">Em rota <b>{active}</b></span>
            <span className="ops-count-chip">Concluídos <b>{completed}</b></span>
            <span className="ops-count-chip">Cancelados <b>{cancelled}</b></span>
          </div>

          <LiveDeliveries storeId={store.id} initialDeliveries={deliveries} limit={8}/>
        </article>

        <aside className="ops-side-stack">
          <article className="ops-side-card">
            <h3>Ações rápidas</h3>
            <p>Atalhos para as tarefas mais usadas durante a operação.</p>
            <div className="ops-quick-grid">
              <Link href="/entregas/nova" className="ops-quick-link">
                <span><Icon name="plus" size={16}/></span>
                <strong>Nova entrega</strong>
              </Link>
              <Link href="/pedidos" className="ops-quick-link">
                <span><Icon name="box" size={16}/></span>
                <strong>Pedidos</strong>
              </Link>
              <Link href="/entregadores" className="ops-quick-link">
                <span><Icon name="users" size={16}/></span>
                <strong>Entregadores</strong>
              </Link>
              <Link href="/mapa" className="ops-quick-link">
                <span><Icon name="map" size={16}/></span>
                <strong>Mapa ao vivo</strong>
              </Link>
            </div>
          </article>

          <article className="ops-side-card">
            <h3>Carteira da loja</h3>
            <p>Saldo usado para financiar a operação de entregas.</p>
            <div className="ops-wallet-balance">{currency(walletAvailable)}</div>
            <div className="ops-wallet-meta">
              <div>
                <small>Reservado</small>
                <strong>{currency(walletReserved)}</strong>
              </div>
              <div>
                <small>Taxas hoje</small>
                <strong>{currency(gross)}</strong>
              </div>
            </div>
            <div className="ops-hero-actions">
              <Link href="/financeiro" className="ops-secondary-action">Abrir financeiro</Link>
            </div>
          </article>
        </aside>
      </section>

      <section className="ops-panel ops-map-panel">
        <div className="ops-panel-head">
          <div className="ops-panel-title">
            <span><Icon name="map" size={18}/></span>
            <div>
              <h2>Operação no mapa</h2>
              <p>Entregas em andamento, aguardando e destinos ativos</p>
            </div>
          </div>
          <Link href="/mapa" className="ops-panel-link">Abrir mapa completo</Link>
        </div>
        <div className="ops-map-body">
          <DashboardLiveMap
            storeLatitude={store.latitude}
            storeLongitude={store.longitude}
            deliveries={activeMapDeliveries}
          />
        </div>
      </section>

      <section className="ops-bottom-grid">
        <article className="ops-panel ops-analytics">
          <div className="ops-analytics-head">
            <div>
              <strong>Custos de entrega</strong>
              <small>Últimos 7 dias</small>
            </div>
            <Link href="/financeiro" className="ops-panel-link">Financeiro</Link>
          </div>
          <div className="ops-week-total">{currency(weekGross)}</div>
          <div className="ops-bars">
            {days.map(item => (
              <div className="ops-bar-col" key={item.label}>
                <i style={{ height:`${Math.max(7,(item.value / maxDayValue) * 78)}px` }}/>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-panel ops-analytics">
          <div className="ops-analytics-head">
            <div>
              <strong>Atividade recente</strong>
              <small>Últimas movimentações da operação</small>
            </div>
            <Link href="/entregas" className="ops-panel-link">Entregas</Link>
          </div>

          <div className="ops-activity-list">
            {deliveries.slice(0,6).map(item => {
              const done = item.status === 'completed'
              const live = activeStatuses.includes(item.status)
              return (
                <div className="ops-activity-item" key={item.id}>
                  <span className={`ops-activity-icon ${done ? 'done' : live ? 'live' : ''}`}>
                    <Icon name={done ? 'check' : live ? 'truck' : 'clock'} size={14}/>
                  </span>
                  <span className="ops-activity-copy">
                    <strong>Pedido #{shortId(item.id)}</strong>
                    <small>{statusLabel[item.status] ?? item.status}</small>
                  </span>
                  <span className="ops-activity-time">{onlyTime(item.updated_at)}</span>
                </div>
              )
            })}
            {!deliveries.length ? (
              <div className="empty premium-empty">Nenhuma atividade registrada hoje.</div>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  )
}
