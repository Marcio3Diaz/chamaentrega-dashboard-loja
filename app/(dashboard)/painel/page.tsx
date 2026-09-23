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
    { icon:'box', label:'Pedidos hoje', value:String(deliveries.length), note:`${completed} concluída${completed === 1 ? '' : 's'}`, tone:'gold' },
    { icon:'truck', label:'Em andamento', value:String(active), note:`${waiting} buscando entregador`, tone:'blue' },
    { icon:'user', label:'Entregadores online', value:String(couriers.length), note:'Disponíveis na sua região', tone:'green' },
    { icon:'money', label:'Saldo disponível', value:currency(walletAvailable), note:`${currency(walletReserved)} reservado`, tone:'gold' },
  ]

  return <>
    <div className="dashboard-home-v3">
      <section className="home-hero-v3">
        <div className="home-hero-copy">
          <div className="eyebrow">VISÃO GERAL</div>
          <h1>Olá, <span>{store.name}.</span></h1>
          <p>Veja o que está acontecendo na sua operação agora.</p>

          <div className="home-hero-statuses">
            <span className="home-live-chip"><i /> Sistema online</span>
            <span>{active} entrega{active === 1 ? '' : 's'} em andamento</span>
            <span>{waiting} aguardando entregador</span>
          </div>
        </div>

        <Link href="/entregas/nova" className="home-primary-action">
          <span className="home-primary-action-icon"><Icon name="plus" size={22}/></span>
          <span>
            <strong>Nova entrega</strong>
            <small>Pedido pronto para sair</small>
          </span>
          <Icon name="arrow" size={18}/>
        </Link>
      </section>

      <section className="home-kpis-v3">
        {metrics.map(metric => (
          <article className={`home-kpi-v3 ${metric.tone}`} key={metric.label}>
            <span className="home-kpi-icon"><Icon name={metric.icon} size={22}/></span>
            <div>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <span>{metric.note}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="home-main-grid-v3">
        <article className="home-panel-v3 home-deliveries-v3">
          <div className="home-panel-head-v3">
            <div>
              <span className="home-panel-kicker">HOJE</span>
              <h2>Entregas</h2>
              <p>Acompanhe os pedidos publicados pela sua loja.</p>
            </div>
            <Link href="/entregas" className="home-secondary-action">Ver todas <Icon name="arrow" size={15}/></Link>
          </div>
          <LiveDeliveries storeId={store.id} initialDeliveries={deliveries} limit={5}/>
        </article>

        <aside className="home-panel-v3 home-actions-v3">
          <div className="home-panel-head-v3">
            <div>
              <span className="home-panel-kicker">ATALHOS</span>
              <h2>Ações rápidas</h2>
              <p>O que você mais usa, a um clique.</p>
            </div>
          </div>

          <div className="home-action-list-v3">
            <Link href="/entregas/nova" className="primary">
              <span><Icon name="plus" size={20}/></span>
              <div><strong>Nova entrega</strong><small>Publicar pedido pronto</small></div>
              <b>›</b>
            </Link>
            <Link href="/entregadores">
              <span><Icon name="user" size={20}/></span>
              <div><strong>Entregadores</strong><small>{couriers.length} online agora</small></div>
              <b>›</b>
            </Link>
            <Link href="/mapa">
              <span><Icon name="map" size={20}/></span>
              <div><strong>Mapa ao vivo</strong><small>Acompanhar rotas e corridas</small></div>
              <b>›</b>
            </Link>
            <Link href="/financeiro">
              <span><Icon name="chart" size={20}/></span>
              <div><strong>Financeiro</strong><small>Carteira, taxas e histórico</small></div>
              <b>›</b>
            </Link>
          </div>
        </aside>
      </section>

      <section className="home-bottom-grid-v3">
        <article className="home-panel-v3 home-map-v3">
          <div className="home-panel-head-v3">
            <div>
              <span className="home-panel-kicker">OPERAÇÃO</span>
              <h2>Mapa ao vivo</h2>
              <p>Visualize a entrega ativa e acompanhe sua região.</p>
            </div>
            <Link href="/mapa" className="home-secondary-action">Abrir mapa <Icon name="arrow" size={15}/></Link>
          </div>

          <div className="home-live-map-v3">
            <svg viewBox="0 0 760 260" preserveAspectRatio="none" aria-hidden="true">
              <path className="map-street" d="M0 50 130 90 245 38 390 110 540 58 760 115M0 205 135 150 285 220 450 160 620 222 760 175M88 0 145 260M315 0 360 260M610 0 540 260"/>
              <polyline className="route-line" points="72,175 168,132 215,72 350,116 486,83 588,146 700,102"/>
            </svg>

            <span className="home-map-origin"><Icon name="truck" size={18}/></span>
            <span className="home-map-destination"><Icon name="pin" size={19}/></span>

            <div className="home-map-live-chip"><i /> AO VIVO</div>

            <div className="home-map-current-v3">
              <span className="map-small-icon"><Icon name="box" size={16}/></span>
              <div>
                <strong>{activeDelivery ? `Entrega #${shortId(activeDelivery.id)}` : 'Nenhuma entrega ativa'}</strong>
                <small>{activeDelivery ? (statusLabel[activeDelivery.status] ?? activeDelivery.status) : 'Publique uma nova entrega para começar'}</small>
              </div>
              <Icon name="arrow" size={16}/>
            </div>
          </div>
        </article>

        <div className="home-side-stack-v3">
          <article className="home-panel-v3 home-wallet-v3">
            <div className="home-panel-head-v3 compact">
              <div>
                <span className="home-panel-kicker">CARTEIRA</span>
                <h2>Saldo da loja</h2>
              </div>
              <Link href="/financeiro" className="home-secondary-action">Recarregar</Link>
            </div>

            <div className="home-wallet-balance-v3">
              <small>Disponível para entregas</small>
              <strong>{currency(walletAvailable)}</strong>
            </div>

            <div className="home-wallet-stats-v3">
              <div><small>Reservado</small><strong>{currency(walletReserved)}</strong></div>
              <div><small>Taxas hoje</small><strong>{currency(gross)}</strong></div>
              <div><small>Saldo total</small><strong>{currency(walletBalance)}</strong></div>
            </div>
          </article>

          <article className="home-panel-v3 home-courier-v3">
            <div className="home-panel-head-v3 compact">
              <div>
                <span className="home-panel-kicker">REDE LOCAL</span>
                <h2>Entregadores disponíveis</h2>
              </div>
              <Link href="/entregadores" className="home-secondary-action">Ver todos</Link>
            </div>

            {firstCourier ? (
              <div className="home-courier-row-v3">
                <div className="courier-photo">
                  {firstProfile?.avatar_url ? <img src={firstProfile.avatar_url} alt="" /> : (firstProfile?.full_name?.slice(0,1) ?? 'E')}
                </div>
                <span className="courier-live-dot"/>
                <div>
                  <strong>{firstProfile?.full_name ?? 'Entregador parceiro'}</strong>
                  <small>★ {Number(firstCourier.rating).toFixed(1)} · {firstCourier.total_deliveries} entregas</small>
                </div>
                <span className="online-tag">Online</span>
              </div>
            ) : (
              <div className="home-empty-v3">Nenhum entregador disponível agora.</div>
            )}
          </article>
        </div>
      </section>
    </div>
  </>
}
