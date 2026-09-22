import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'
import { OperationAutoRefresh } from './operation-auto-refresh'
import './operacao.css'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

const statusLabel:Record<string,string> = {
  available:'Buscando entregador',
  negotiating:'Negociando',
  accepted:'Aceita',
  heading_to_pickup:'Indo para coleta',
  at_pickup:'Na loja',
  heading_to_dropoff:'Em rota para o cliente',
  at_dropoff:'No destino',
}

function shortId(value:string) {
  return '#' + value.replaceAll('-','').slice(0,7).toUpperCase()
}

function ageLabel(value:string|null) {
  if (!value) return 'sem atualização'
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.max(0,Math.floor(diff/60000))
  if (mins < 1) return 'agora'
  if (mins < 60) return mins + ' min atrás'
  const hours = Math.floor(mins/60)
  return hours + 'h atrás'
}

export default async function AdminLiveOperationPage() {
  const supabase = await createClient()

  const [
    couriersResult,
    profilesResult,
    deliveriesResult,
    storesResult,
  ] = await Promise.all([
    supabase
      .from('couriers')
      .select('id,is_online,is_available,current_latitude,current_longitude,last_location_at,vehicle_type,moderation_status')
      .eq('moderation_status','active')
      .order('is_online',{ascending:false}),
    supabase
      .from('profiles')
      .select('id,full_name,phone,avatar_url')
      .eq('role','courier'),
    supabase
      .from('deliveries')
      .select('id,store_id,assigned_courier_id,status,pickup_address,delivery_address,delivery_fee,customer_name,created_at,updated_at')
      .in('status',[...activeStatuses,'available','negotiating'])
      .order('created_at',{ascending:false}),
    supabase
      .from('stores')
      .select('id,name,logo_url,latitude,longitude,is_active,moderation_status'),
  ])

  const profiles = new Map((profilesResult.data ?? []).map(item => [item.id,item]))
  const stores = new Map((storesResult.data ?? []).map(item => [item.id,item]))
  const deliveries = deliveriesResult.data ?? []

  const onlineCouriers = (couriersResult.data ?? []).filter(item => item.is_online)
  const availableCouriers = onlineCouriers.filter(item => item.is_available)
  const activeDeliveries = deliveries.filter(item => activeStatuses.includes(item.status))
  const waitingDeliveries = deliveries.filter(item => ['available','negotiating'].includes(item.status))

  const currentDeliveryByCourier = new Map<string,any>()
  for (const delivery of activeDeliveries) {
    if (delivery.assigned_courier_id && !currentDeliveryByCourier.has(delivery.assigned_courier_id)) {
      currentDeliveryByCourier.set(delivery.assigned_courier_id,delivery)
    }
  }

  const courierRows = onlineCouriers.map(courier => {
    const profile = profiles.get(courier.id)
    const delivery = currentDeliveryByCourier.get(courier.id)
    const store = delivery ? stores.get(delivery.store_id) : null

    return {
      ...courier,
      fullName:profile?.full_name?.trim() || 'Entregador parceiro',
      phone:profile?.phone ?? null,
      avatarUrl:profile?.avatar_url ?? null,
      delivery,
      storeName:store?.name ?? null,
    }
  })

  return (
    <div className="admin-page admin-live-page">
      <OperationAutoRefresh />
      <section className="admin-page-head admin-live-head">
        <div>
          <div className="admin-eyebrow">CENTRAL OPERACIONAL</div>
          <h1>Operação ao vivo</h1>
          <p>Monitore entregadores, corridas e pedidos aguardando despacho em uma única tela.</p>
        </div>
        <span className="admin-live-pill admin-live-pill-large"><i/> TEMPO REAL</span>
      </section>

      <section className="admin-live-metrics">
        <article className="green">
          <span><Icon name="user" size={22}/></span>
          <div><small>Entregadores online</small><strong>{onlineCouriers.length}</strong><em>{availableCouriers.length} disponíveis</em></div>
        </article>
        <article className="blue">
          <span><Icon name="route" size={22}/></span>
          <div><small>Entregas em andamento</small><strong>{activeDeliveries.length}</strong><em>aceitas ou em rota</em></div>
        </article>
        <article className={waitingDeliveries.length ? 'warning' : 'green'}>
          <span><Icon name="clock" size={22}/></span>
          <div><small>Aguardando entregador</small><strong>{waitingDeliveries.length}</strong><em>{waitingDeliveries.length ? 'precisam de despacho' : 'fila normal'}</em></div>
        </article>
        <article className="gold">
          <span><Icon name="store" size={22}/></span>
          <div><small>Lojas ativas</small><strong>{[...stores.values()].filter(s => s.is_active && s.moderation_status === 'active').length}</strong><em>operando na rede</em></div>
        </article>
      </section>

      <section className="admin-live-grid">
        <article className="admin-card admin-live-map-card">
          <header>
            <div>
              <span className="admin-card-kicker">MAPA OPERACIONAL</span>
              <h2>Rede em movimento</h2>
            </div>
            <div className="admin-live-legend">
              <span><i className="dot green"/>Disponível</span>
              <span><i className="dot yellow"/>Em coleta</span>
              <span><i className="dot orange"/>Em entrega</span>
              <span><i className="dot red"/>Ocorrência</span>
            </div>
          </header>

          <div className="admin-ops-map">
            <div className="admin-ops-map-grid"/>
            <div className="admin-ops-route route-a"/>
            <div className="admin-ops-route route-b"/>

            {[...stores.values()].slice(0,4).map((store,index) => (
              <div
                key={store.id}
                className={'admin-map-marker store marker-'+((index%4)+1)}
                title={store.name}
              >
                <Icon name="store" size={16}/>
              </div>
            ))}

            {courierRows.slice(0,6).map((courier,index) => {
              const tone = courier.delivery
                ? ['heading_to_dropoff','at_dropoff'].includes(courier.delivery.status)
                  ? 'orange'
                  : 'yellow'
                : courier.is_available ? 'green' : 'blue'

              return (
                <Link
                  key={courier.id}
                  href="/admin/entregadores"
                  className={'admin-map-marker courier '+tone+' courier-'+((index%6)+1)}
                  title={courier.fullName}
                >
                  <Icon name="truck" size={16}/>
                </Link>
              )
            })}

            <div className="admin-map-city">Rio de Janeiro</div>
            <div className="admin-map-live-chip"><i/> Atualização operacional ativa</div>
          </div>
        </article>

        <aside className="admin-card admin-live-side">
          <header>
            <div>
              <span className="admin-card-kicker">ENTREGADORES ONLINE</span>
              <h2>Rede disponível</h2>
            </div>
            <Link href="/admin/entregadores">Ver todos</Link>
          </header>

          <div className="admin-live-courier-list">
            {courierRows.slice(0,6).map(courier => (
              <article key={courier.id}>
                <div className="admin-live-avatar">
                  {courier.avatarUrl
                    ? <img src={courier.avatarUrl} alt=""/>
                    : courier.fullName.slice(0,1).toUpperCase()}
                </div>
                <div className="admin-live-courier-copy">
                  <strong>{courier.fullName}</strong>
                  <span>
                    {courier.delivery
                      ? (statusLabel[courier.delivery.status] ?? courier.delivery.status)
                      : courier.is_available ? 'Disponível para ofertas' : 'Online'}
                  </span>
                  <small>
                    {courier.storeName ? courier.storeName+' · ' : ''}
                    Localização {ageLabel(courier.last_location_at)}
                  </small>
                </div>
                <span className={'admin-courier-state '+(courier.delivery ? 'busy' : courier.is_available ? 'available' : 'online')}>
                  {courier.delivery ? 'EM ROTA' : courier.is_available ? 'LIVRE' : 'ONLINE'}
                </span>
              </article>
            ))}

            {!courierRows.length ? (
              <div className="admin-empty">Nenhum entregador online neste momento.</div>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="admin-live-bottom-grid">
        <article className="admin-card admin-live-queue">
          <header>
            <div>
              <span className="admin-card-kicker">FILA DE DESPACHO</span>
              <h2>Pedidos aguardando entregador</h2>
            </div>
            <Link href="/admin/corridas">Abrir corridas</Link>
          </header>

          <div className="admin-live-queue-list">
            {waitingDeliveries.slice(0,8).map(delivery => {
              const store = stores.get(delivery.store_id)
              return (
                <article key={delivery.id}>
                  <span className="admin-queue-icon"><Icon name="clock" size={18}/></span>
                  <div>
                    <strong>{store?.name ?? 'Loja'} <em>{shortId(delivery.id)}</em></strong>
                    <small>{delivery.delivery_address}</small>
                  </div>
                  <span>{statusLabel[delivery.status] ?? delivery.status}</span>
                  <b>R$ {Number(delivery.delivery_fee ?? 0).toFixed(2).replace('.',',')}</b>
                  <Link href="/admin/corridas"><Icon name="chevron" size={16}/></Link>
                </article>
              )
            })}

            {!waitingDeliveries.length ? (
              <div className="admin-live-empty-ok">
                <Icon name="check" size={28}/>
                <div><strong>Nenhum pedido parado</strong><span>O fluxo de despacho está normal.</span></div>
              </div>
            ) : null}
          </div>
        </article>

        <article className="admin-card admin-live-actions">
          <header>
            <div>
              <span className="admin-card-kicker">AÇÕES OPERACIONAIS</span>
              <h2>Comandos rápidos</h2>
            </div>
          </header>
          <div>
            <Link href="/admin/corridas"><span><Icon name="route" size={20}/></span><div><strong>Gerenciar corridas</strong><small>Veja entregas e status atuais</small></div><Icon name="chevron" size={16}/></Link>
            <Link href="/admin/entregadores"><span><Icon name="users" size={20}/></span><div><strong>Monitorar entregadores</strong><small>Disponibilidade e última localização</small></div><Icon name="chevron" size={16}/></Link>
            <Link href="/admin/lojas"><span><Icon name="store" size={20}/></span><div><strong>Ver lojas</strong><small>Status e operação da rede</small></div><Icon name="chevron" size={16}/></Link>
            <Link href="/admin/financeiro"><span><Icon name="money" size={20}/></span><div><strong>Financeiro</strong><small>Taxas, saldos e movimentações</small></div><Icon name="chevron" size={16}/></Link>
          </div>
        </article>
      </section>
    </div>
  )
}
