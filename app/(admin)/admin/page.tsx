import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  }).format(value)
}

function time(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
  }).format(new Date(value))
}

function shortId(value:string) {
  return '#' + value.replaceAll('-','').slice(0,7).toUpperCase()
}

const statusLabel:Record<string,string> = {
  draft:'Rascunho',
  available:'Buscando entregador',
  negotiating:'Negociando',
  accepted:'Aceita',
  heading_to_pickup:'A caminho da loja',
  at_pickup:'Na loja',
  heading_to_dropoff:'A caminho do cliente',
  at_dropoff:'No destino',
  completed:'Concluída',
  cancelled:'Cancelada',
  expired:'Expirada',
}

export default async function AdminOverviewPage() {
  const supabase = await createClient()
  const start = new Date()
  start.setHours(0,0,0,0)
  const startIso = start.toISOString()

  const [
    storesResult,
    courierResult,
    profilesResult,
    todayDeliveriesResult,
    walletsResult,
    topupsResult,
    recentDeliveriesResult,
    recentStoresResult,
  ] = await Promise.all([
    supabase.from('stores')
      .select('id,name,is_active,city,state,logo_url,created_at,owner_id')
      .order('created_at',{ascending:false}),
    supabase.from('couriers')
      .select('id,is_online,is_available,total_deliveries,rating,created_at'),
    supabase.from('profiles')
      .select('id,full_name,role,avatar_url,created_at'),
    supabase.from('deliveries')
      .select('id,store_id,status,delivery_fee,customer_name,created_at,assigned_courier_id')
      .gte('created_at',startIso)
      .order('created_at',{ascending:false}),
    supabase.from('store_wallets')
      .select('store_id,balance,reserved_balance'),
    supabase.from('store_wallet_topups')
      .select('amount,status,created_at')
      .eq('status','paid'),
    supabase.from('deliveries')
      .select('id,store_id,status,delivery_fee,customer_name,created_at')
      .order('created_at',{ascending:false})
      .limit(8),
    supabase.from('stores')
      .select('id,name,is_active,city,state,logo_url,created_at')
      .order('created_at',{ascending:false})
      .limit(5),
  ])

  const stores = storesResult.data ?? []
  const couriers = courierResult.data ?? []
  const profiles = profilesResult.data ?? []
  const todayDeliveries = todayDeliveriesResult.data ?? []
  const wallets = walletsResult.data ?? []
  const paidTopups = topupsResult.data ?? []
  const recentDeliveries = recentDeliveriesResult.data ?? []
  const recentStores = recentStoresResult.data ?? []

  const storeMap = new Map(stores.map(store => [store.id,store]))
  const activeStores = stores.filter(store => store.is_active).length
  const storeOwners = profiles.filter(profile => profile.role === 'store_owner').length
  const onlineCouriers = couriers.filter(courier => courier.is_online).length
  const availableCouriers = couriers.filter(courier => courier.is_online && courier.is_available).length
  const activeDeliveries = todayDeliveries.filter(delivery => activeStatuses.includes(delivery.status)).length
  const searching = todayDeliveries.filter(delivery => ['available','negotiating'].includes(delivery.status)).length
  const completedToday = todayDeliveries.filter(delivery => delivery.status === 'completed').length
  const feeVolumeToday = todayDeliveries
    .filter(delivery => !['draft','cancelled','expired'].includes(delivery.status))
    .reduce((sum,delivery) => sum + Number(delivery.delivery_fee ?? 0),0)
  const totalWalletBalance = wallets.reduce((sum,wallet) => sum + Number(wallet.balance ?? 0),0)
  const reservedWalletBalance = wallets.reduce((sum,wallet) => sum + Number(wallet.reserved_balance ?? 0),0)
  const topupVolume = paidTopups.reduce((sum,topup) => sum + Number(topup.amount ?? 0),0)

  const metrics = [
    {
      icon:'store',
      label:'Lojas cadastradas',
      value:String(stores.length),
      note:`${activeStores} ativas na plataforma`,
      tone:'gold',
    },
    {
      icon:'user',
      label:'Entregadores',
      value:String(couriers.length),
      note:`${onlineCouriers} online · ${availableCouriers} disponíveis`,
      tone:'green',
    },
    {
      icon:'route',
      label:'Corridas hoje',
      value:String(todayDeliveries.length),
      note:`${activeDeliveries} em andamento · ${searching} buscando`,
      tone:'blue',
    },
    {
      icon:'check',
      label:'Concluídas hoje',
      value:String(completedToday),
      note:'entregas finalizadas',
      tone:'green',
    },
    {
      icon:'money',
      label:'Volume de taxas hoje',
      value:money(feeVolumeToday),
      note:'taxas de entrega movimentadas',
      tone:'gold',
    },
  ]

  return (
    <div className="admin-page">
      <section className="admin-hero">
        <div>
          <div className="admin-eyebrow">VISÃO GERAL DA PLATAFORMA</div>
          <h1>Central <span>ChamaEntrega</span></h1>
          <p>
            Acompanhe lojas, entregadores, corridas e o movimento financeiro de toda a rede.
          </p>
        </div>

        <div className="admin-hero-status">
          <Icon name="shield" size={27}/>
          <span>
            <small>AMBIENTE ADMINISTRATIVO</small>
            <strong>Acesso da plataforma</strong>
          </span>
        </div>
      </section>

      <section className="admin-metrics">
        {metrics.map(metric => (
          <article key={metric.label} className={metric.tone}>
            <span className="admin-metric-icon"><Icon name={metric.icon} size={22}/></span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <span>{metric.note}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-overview-grid">
        <article className="admin-card admin-network-card">
          <header>
            <div>
              <span className="admin-card-kicker">REDE CHAMAENTREGA</span>
              <h2>Saúde da plataforma</h2>
            </div>
            <span className="admin-live-pill"><i/> AO VIVO</span>
          </header>

          <div className="admin-health-grid">
            <div>
              <span><Icon name="store" size={19}/></span>
              <small>Lojas ativas</small>
              <strong>{activeStores}/{stores.length}</strong>
            </div>
            <div>
              <span><Icon name="user" size={19}/></span>
              <small>Entregadores online</small>
              <strong>{onlineCouriers}</strong>
            </div>
            <div>
              <span><Icon name="activity" size={19}/></span>
              <small>Corridas ativas</small>
              <strong>{activeDeliveries}</strong>
            </div>
            <div>
              <span><Icon name="money" size={19}/></span>
              <small>Saldo das lojas</small>
              <strong>{money(totalWalletBalance)}</strong>
            </div>
          </div>

          <div className="admin-health-bar">
            <div>
              <span>Disponibilidade da rede</span>
              <strong>
                {couriers.length
                  ? Math.round((availableCouriers/couriers.length)*100)
                  : 0}%
              </strong>
            </div>
            <i>
              <b style={{
                width:`${couriers.length ? Math.round((availableCouriers/couriers.length)*100) : 0}%`,
              }}/>
            </i>
          </div>

          <div className="admin-health-notes">
            <span><i className="green"/> {availableCouriers} entregadores prontos para oferta</span>
            <span><i className="gold"/> {searching} pedidos procurando entregador</span>
            <span><i className="blue"/> {storeOwners} contas comerciais cadastradas</span>
          </div>
        </article>

        <article className="admin-card admin-finance-summary">
          <header>
            <div>
              <span className="admin-card-kicker">FINANCEIRO</span>
              <h2>Movimento da rede</h2>
            </div>
            <Link href="/admin/financeiro">Abrir financeiro →</Link>
          </header>

          <div className="admin-finance-big">
            <small>Recargas confirmadas</small>
            <strong>{money(topupVolume)}</strong>
            <span>volume acumulado de recargas pagas</span>
          </div>

          <div className="admin-finance-mini">
            <div>
              <small>Carteiras</small>
              <strong>{money(totalWalletBalance)}</strong>
            </div>
            <div>
              <small>Reservado</small>
              <strong>{money(reservedWalletBalance)}</strong>
            </div>
            <div>
              <small>Taxas hoje</small>
              <strong>{money(feeVolumeToday)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-overview-grid lower">
        <article className="admin-card admin-recent-deliveries">
          <header>
            <div>
              <span className="admin-card-kicker">OPERAÇÃO</span>
              <h2>Corridas recentes</h2>
            </div>
            <Link href="/admin/corridas">Ver todas →</Link>
          </header>

          <div className="admin-simple-table">
            <div className="head">
              <span>Corrida</span>
              <span>Loja</span>
              <span>Cliente</span>
              <span>Status</span>
              <span>Taxa</span>
              <span>Horário</span>
            </div>
            {recentDeliveries.map(delivery => {
              const store = storeMap.get(delivery.store_id)
              return (
                <div className="row" key={delivery.id}>
                  <b>{shortId(delivery.id)}</b>
                  <span>{store?.name ?? 'Loja'}</span>
                  <span>{delivery.customer_name ?? 'Cliente'}</span>
                  <em className={'admin-delivery-status '+delivery.status}>
                    {statusLabel[delivery.status] ?? delivery.status}
                  </em>
                  <strong>{money(Number(delivery.delivery_fee ?? 0))}</strong>
                  <small>{time(delivery.created_at)}</small>
                </div>
              )
            })}
            {!recentDeliveries.length ? <div className="admin-empty">Nenhuma corrida registrada.</div> : null}
          </div>
        </article>

        <article className="admin-card admin-new-stores">
          <header>
            <div>
              <span className="admin-card-kicker">CRESCIMENTO</span>
              <h2>Lojas recentes</h2>
            </div>
            <Link href="/admin/lojas">Gerenciar →</Link>
          </header>

          <div className="admin-new-store-list">
            {recentStores.map(store => (
              <div key={store.id}>
                <span className="admin-new-store-logo">
                  {store.logo_url
                    ? <img src={store.logo_url} alt=""/>
                    : store.name.slice(0,2).toUpperCase()}
                </span>
                <span>
                  <strong>{store.name}</strong>
                  <small>
                    {store.city && store.state
                      ? `${store.city} · ${store.state}`
                      : 'Local não informado'}
                  </small>
                </span>
                <em className={store.is_active ? 'active' : 'paused'}>
                  {store.is_active ? 'Ativa' : 'Pausada'}
                </em>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
