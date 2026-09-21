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

function Sparkline({ tone='gold' }:{ tone?:'gold'|'green'|'blue'|'muted' }) {
  return (
    <svg className={`admin-v2-spark ${tone}`} viewBox="0 0 90 30" aria-hidden="true">
      <path d="M2 26 C12 26,13 13,25 15 S38 4,48 12 S64 9,72 5 S82 4,88 2"/>
    </svg>
  )
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
    revenueEventsResult,
    subscriptionsResult,
    recentDeliveriesResult,
    recentStoresResult,
  ] = await Promise.all([
    supabase.from('stores')
      .select('id,name,is_active,city,state,logo_url,created_at,owner_id,moderation_status')
      .order('created_at',{ascending:false}),
    supabase.from('couriers')
      .select('id,is_online,is_available,total_deliveries,rating,created_at,moderation_status'),
    supabase.from('profiles')
      .select('id,full_name,role,avatar_url,created_at'),
    supabase.from('deliveries')
      .select('id,store_id,status,delivery_fee,customer_name,created_at,assigned_courier_id')
      .gte('created_at',startIso)
      .order('created_at',{ascending:false}),
    supabase.from('platform_revenue_events')
      .select('amount,status,revenue_type,occurred_at')
      .neq('status','void')
      .order('occurred_at',{ascending:false}),
    supabase.from('store_subscriptions')
      .select('monthly_amount,status'),
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
  const revenueEvents = revenueEventsResult.data ?? []
  const subscriptions = subscriptionsResult.data ?? []
  const recentDeliveries = recentDeliveriesResult.data ?? []
  const recentStores = recentStoresResult.data ?? []

  const storeMap = new Map(stores.map(store => [store.id,store]))
  const activeStores = stores.filter(store => store.is_active && store.moderation_status === 'active').length
  const pendingStores = stores.filter(store => store.moderation_status === 'pending').length
  const pendingCouriers = couriers.filter(courier => courier.moderation_status === 'pending').length
  const storeOwners = profiles.filter(profile => profile.role === 'store_owner').length
  const onlineCouriers = couriers.filter(courier => courier.moderation_status === 'active' && courier.is_online).length
  const availableCouriers = couriers.filter(courier => courier.moderation_status === 'active' && courier.is_online && courier.is_available).length
  const activeDeliveries = todayDeliveries.filter(delivery => activeStatuses.includes(delivery.status)).length
  const searching = todayDeliveries.filter(delivery => ['available','negotiating'].includes(delivery.status)).length
  const completedToday = todayDeliveries.filter(delivery => delivery.status === 'completed').length
  const feeVolumeToday = todayDeliveries
    .filter(delivery => !['draft','cancelled','expired'].includes(delivery.status))
    .reduce((sum,delivery) => sum + Number(delivery.delivery_fee ?? 0),0)
  const totalPlatformRevenue = revenueEvents.reduce((sum,event) => sum + Number(event.amount ?? 0),0)
  const accruedPlatformRevenue = revenueEvents
    .filter(event => event.status === 'accrued')
    .reduce((sum,event) => sum + Number(event.amount ?? 0),0)
  const paidPlatformRevenueToday = revenueEvents
    .filter(event =>
      event.status === 'paid' &&
      new Date(event.occurred_at).getTime() >= new Date(startIso).getTime()
    )
    .reduce((sum,event) => sum + Number(event.amount ?? 0),0)
  const platformMrr = subscriptions
    .filter(subscription => subscription.status === 'active')
    .reduce((sum,subscription) => sum + Number(subscription.monthly_amount ?? 0),0)
  const networkAvailability = couriers.length
    ? Math.round((availableCouriers/couriers.length)*100)
    : 0

  const metrics = [
    {
      icon:'store',
      label:'Lojas cadastradas',
      value:String(stores.length),
      note:`${activeStores} ativas na plataforma`,
      tone:'gold',
      trend:stores.length ? '+100%' : '0%',
      href:'/admin/lojas',
    },
    {
      icon:'users',
      label:'Entregadores',
      value:String(couriers.length),
      note:`${onlineCouriers} online · ${Math.max(couriers.length-onlineCouriers,0)} offline`,
      tone:'green',
      trend:couriers.length ? '+100%' : '0%',
      href:'/admin/entregadores',
    },
    {
      icon:'route',
      label:'Corridas hoje',
      value:String(todayDeliveries.length),
      note:`${activeDeliveries} em andamento · ${searching} buscando`,
      tone:'blue',
      trend:todayDeliveries.length ? '+100%' : '0%',
      href:'/admin/corridas',
    },
    {
      icon:'check',
      label:'Concluídas hoje',
      value:String(completedToday),
      note:'entregas finalizadas',
      tone:'green',
      trend:completedToday ? '+100%' : '0%',
      href:'/admin/corridas',
    },
    {
      icon:'money',
      label:'Volume de taxas hoje',
      value:money(feeVolumeToday),
      note:'taxa de serviço na plataforma',
      tone:'gold',
      trend:feeVolumeToday ? '+100%' : '0%',
      href:'/admin/financeiro',
    },
  ] as const

  return (
    <div className="admin-page admin-v2-page">
      <section className="admin-v2-hero">
        <div className="admin-v2-hero-copy">
          <div className="admin-eyebrow">VISÃO GERAL DA PLATAFORMA</div>
          <h1>Central <span>ChamaEntrega</span></h1>
          <p>
            Acompanhe lojas, entregadores, corridas e o movimento financeiro
            de toda a rede em tempo real.
          </p>

          <div className="admin-v2-hero-tags">
            <span><Icon name="lightning" size={14}/> Mais entregas</span>
            <span><Icon name="users" size={14}/> Mais negócios</span>
            <span><Icon name="chart" size={14}/> Uma cidade mais conectada</span>
          </div>
        </div>

        <div className="admin-v2-hero-art" aria-hidden="true">
          <span className="admin-v2-script">Chamou,<br/>Chegou!</span>
        </div>

        <div className="admin-v2-hero-access">
          <Icon name="shield" size={28}/>
          <span>
            <small>AMBIENTE ADMINISTRATIVO</small>
            <strong>Acesso da plataforma</strong>
          </span>
          <Icon name="chevron" size={18}/>
        </div>
      </section>

      <section className="admin-v2-metrics">
        {metrics.map((metric,index) => (
          <Link key={metric.label} href={metric.href} className={`admin-v2-metric ${metric.tone}`}>
            <span className="admin-v2-metric-icon">
              <Icon name={metric.icon} size={22}/>
            </span>

            <div className="admin-v2-metric-copy">
              <small>{metric.label}</small>
              <div className="admin-v2-metric-value-row">
                <strong>{metric.value}</strong>
                <em className={metric.trend === '0%' ? 'neutral' : ''}>
                  {metric.trend === '0%' ? '0%' : '↑ ' + metric.trend}
                </em>
              </div>
              <span>{metric.note}</span>
            </div>

            <Sparkline tone={index===1 ? 'green' : index===2 ? 'blue' : index===3 ? 'muted' : 'gold'}/>
            <span className="admin-v2-card-arrow"><Icon name="chevron" size={16}/></span>
          </Link>
        ))}
      </section>

      <section className="admin-v2-utility-grid">
        <article className="admin-v2-panel admin-v2-quick">
          <header className="admin-v2-panel-head compact">
            <div>
              <span className="admin-card-kicker">ATALHOS RÁPIDOS</span>
              <h2>Ações frequentes</h2>
              <p>Acesse as áreas mais usadas da administração.</p>
            </div>
          </header>

          <div className="admin-v2-quick-grid">
            <Link href="/admin/lojas">
              <span><Icon name="store" size={21}/></span>
              <div><strong>Gerenciar lojas</strong><small>Cadastros, status e operação</small></div>
              <Icon name="chevron" size={17}/>
            </Link>
            <Link href="/admin/entregadores">
              <span><Icon name="users" size={21}/></span>
              <div><strong>Entregadores</strong><small>Rede, disponibilidade e cadastros</small></div>
              <Icon name="chevron" size={17}/>
            </Link>
            <Link href="/admin/corridas">
              <span><Icon name="route" size={21}/></span>
              <div><strong>Acompanhar corridas</strong><small>Entregas e status em tempo real</small></div>
              <Icon name="chevron" size={17}/>
            </Link>
            <Link href="/admin/financeiro">
              <span><Icon name="chart" size={21}/></span>
              <div><strong>Financeiro</strong><small>Carteiras, reservas e taxas</small></div>
              <Icon name="chevron" size={17}/>
            </Link>
          </div>
        </article>

        <article className="admin-v2-panel admin-v2-alerts" id="admin-alerts">
          <header className="admin-v2-panel-head compact">
            <div>
              <span className="admin-card-kicker">CENTRAL DE ALERTAS</span>
              <h2>Atenção operacional</h2>
              <p>Itens que merecem acompanhamento agora.</p>
            </div>
            <span className="admin-live-pill"><i/> AO VIVO</span>
          </header>

          <div className="admin-v2-alert-list">
            <Link href="/admin/corridas" className={searching ? 'warning' : 'ok'}>
              <span><Icon name="clock" size={18}/></span>
              <div>
                <strong>{searching ? `${searching} pedido(s) buscando entregador` : 'Nenhum pedido aguardando entregador'}</strong>
                <small>{searching ? 'Verifique a disponibilidade da rede.' : 'Fluxo de despacho normal.'}</small>
              </div>
              <Icon name="chevron" size={16}/>
            </Link>

            <Link href="/admin/entregadores" className={pendingCouriers ? 'warning' : couriers.length-onlineCouriers ? 'info' : 'ok'}>
              <span><Icon name="user" size={18}/></span>
              <div>
                <strong>
                  {pendingCouriers
                    ? pendingCouriers + ' entregador(es) aguardando aprovação'
                    : onlineCouriers + ' de ' + couriers.length + ' entregadores online'}
                </strong>
                <small>
                  {pendingCouriers
                    ? 'Há novos cadastros para análise administrativa.'
                    : availableCouriers + ' disponível(is) para novas ofertas.'}
                </small>
              </div>
              <Icon name="chevron" size={16}/>
            </Link>

            <Link href="/admin/lojas" className={pendingStores ? 'warning' : stores.length-activeStores ? 'info' : 'ok'}>
              <span><Icon name="store" size={18}/></span>
              <div>
                <strong>
                  {pendingStores
                    ? pendingStores + ' loja(s) aguardando aprovação'
                    : activeStores + ' de ' + stores.length + ' lojas ativas'}
                </strong>
                <small>
                  {pendingStores
                    ? 'Abra a gestão de lojas para analisar novos cadastros.'
                    : 'Cadastros de lojas sem pendências de aprovação.'}
                </small>
              </div>
              <Icon name="chevron" size={16}/>
            </Link>

            <Link href="/admin/financeiro" className={accruedPlatformRevenue ? 'info' : 'ok'}>
              <span><Icon name="money" size={18}/></span>
              <div>
                <strong>{money(accruedPlatformRevenue)} de receita a receber</strong>
                <small>Comissões e cobranças pendentes da plataforma.</small>
              </div>
              <Icon name="chevron" size={16}/>
            </Link>
          </div>
        </article>
      </section>

      <section className="admin-v2-main-grid">
        <article className="admin-v2-panel admin-v2-health">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">REDE CHAMAENTREGA</span>
              <h2>Saúde da plataforma</h2>
              <p>Visão geral da operação em tempo real</p>
            </div>

            <div className="admin-v2-panel-actions">
              <span className="admin-live-pill"><i/> AO VIVO</span>
              <span className="admin-v2-period">Últimas 24 horas <Icon name="chevron" size={13}/></span>
            </div>
          </header>

          <div className="admin-v2-health-grid">
            <div>
              <span><Icon name="store" size={19}/></span>
              <small>Lojas ativas</small>
              <strong>{activeStores}/{stores.length}</strong>
              <em>{stores.length ? Math.round((activeStores/stores.length)*100) : 0}% operacionais</em>
            </div>
            <div>
              <span><Icon name="user" size={19}/></span>
              <small>Entregadores online</small>
              <strong>{onlineCouriers}</strong>
              <em>de {couriers.length} cadastrados</em>
            </div>
            <div>
              <span><Icon name="activity" size={19}/></span>
              <small>Corridas ativas</small>
              <strong>{activeDeliveries}</strong>
              <em>em andamento</em>
            </div>
            <div>
              <span><Icon name="money" size={19}/></span>
              <small>Receita da plataforma</small>
              <strong>{money(totalPlatformRevenue)}</strong>
              <em>assinaturas + comissões</em>
            </div>
          </div>

          <div className="admin-v2-availability">
            <div>
              <span>Disponibilidade da rede</span>
              <strong>{networkAvailability}%</strong>
            </div>
            <i><b style={{width:`${networkAvailability}%`}}/></i>
          </div>

          <div className="admin-v2-health-notes">
            <span><i className="green"/> {availableCouriers} serviços online</span>
            <span><i className="gold"/> {searching} pedidos procurando entregador</span>
            <span><i className="blue"/> {storeOwners} contas comerciais cadastradas</span>
          </div>
        </article>

        <article className="admin-v2-panel admin-v2-finance">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">FINANCEIRO</span>
              <h2>Movimento da rede</h2>
              <p>Resumo financeiro da plataforma</p>
            </div>
            <Link href="/admin/financeiro">Abrir financeiro <Icon name="arrow" size={13}/></Link>
          </header>

          <div className="admin-v2-finance-main">
            <div>
              <small>Receita recebida hoje</small>
              <strong>{money(paidPlatformRevenueToday)}</strong>
              <span>Somente receitas pertencentes ao ChamaEntrega.</span>
            </div>

            <div className="admin-v2-bars" aria-hidden="true">
              {[28,40,52,68,61,82,96].map((height,index) => (
                <i key={index} style={{height:`${height}%`}}/>
              ))}
            </div>
          </div>

          <div className="admin-v2-finance-cards">
            <div>
              <span className="green"><Icon name="money" size={18}/></span>
              <small>Receita total</small>
              <strong>{money(totalPlatformRevenue)}</strong>
            </div>
            <div>
              <span className="blue"><Icon name="store" size={18}/></span>
              <small>A receber</small>
              <strong>{money(accruedPlatformRevenue)}</strong>
            </div>
            <div>
              <span className="gold"><Icon name="chart" size={18}/></span>
              <small>MRR</small>
              <strong>{money(platformMrr)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-v2-bottom-grid">
        <article className="admin-v2-panel admin-v2-recent">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">OPERAÇÃO</span>
              <h2>Corridas recentes</h2>
              <p>Últimas corridas realizadas na plataforma</p>
            </div>
            <Link href="/admin/corridas">Ver todas <Icon name="arrow" size={13}/></Link>
          </header>

          <div className="admin-v2-table">
            <div className="head">
              <span>#CORRIDA</span>
              <span>LOJA</span>
              <span>CLIENTE</span>
              <span>STATUS</span>
              <span>TAXA</span>
              <span>HORÁRIO</span>
              <span>AÇÕES</span>
            </div>

            {recentDeliveries.slice(0,5).map(delivery => {
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
                  <button type="button" aria-label="Mais ações">•••</button>
                </div>
              )
            })}

            {!recentDeliveries.length ? <div className="admin-empty">Nenhuma corrida registrada.</div> : null}
          </div>
        </article>

        <article className="admin-v2-panel admin-v2-stores">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">CRESCIMENTO</span>
              <h2>Lojas recentes</h2>
              <p>Últimas lojas cadastradas na plataforma</p>
            </div>
            <Link href="/admin/lojas">Gerenciar <Icon name="arrow" size={13}/></Link>
          </header>

          <div className="admin-v2-store-list">
            {recentStores.slice(0,4).map(store => (
              <div key={store.id}>
                <span className="admin-v2-store-logo">
                  {store.logo_url
                    ? <img src={store.logo_url} alt=""/>
                    : store.name.slice(0,2).toUpperCase()}
                </span>
                <span className="admin-v2-store-copy">
                  <strong>{store.name}</strong>
                  <small>Cadastrada em {time(store.created_at)}</small>
                </span>
                <em className={store.is_active ? 'active' : 'paused'}>
                  <i/>{store.is_active ? 'Ativa' : 'Pausada'}
                </em>
                <button type="button" aria-label="Mais ações">•••</button>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
