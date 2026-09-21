import { createClient } from '@/lib/supabase/server'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

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

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  }).format(value)
}

function dateTime(value:string) {
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

export default async function AdminDeliveriesPage() {
  const supabase = await createClient()

  const [
    deliveriesResult,
    storesResult,
    profilesResult,
  ] = await Promise.all([
    supabase
      .from('deliveries')
      .select('id,store_id,assigned_courier_id,external_order_id,status,delivery_fee,delivery_distance_km,estimated_minutes,customer_name,delivery_address,created_at,completed_at')
      .order('created_at',{ascending:false})
      .limit(250),
    supabase
      .from('stores')
      .select('id,name'),
    supabase
      .from('profiles')
      .select('id,full_name')
      .eq('role','courier'),
  ])

  const deliveries = deliveriesResult.data ?? []
  const stores = new Map((storesResult.data ?? []).map(store => [store.id,store.name]))
  const couriers = new Map((profilesResult.data ?? []).map(profile => [profile.id,profile.full_name]))

  const active = deliveries.filter(delivery => activeStatuses.includes(delivery.status)).length
  const searching = deliveries.filter(delivery => ['available','negotiating'].includes(delivery.status)).length
  const completed = deliveries.filter(delivery => delivery.status === 'completed').length
  const cancelled = deliveries.filter(delivery => ['cancelled','expired'].includes(delivery.status)).length
  const feeVolume = deliveries
    .filter(delivery => !['draft','cancelled','expired'].includes(delivery.status))
    .reduce((sum,delivery) => sum+Number(delivery.delivery_fee ?? 0),0)

  return (
    <div className="admin-page">
      <section className="admin-page-head">
        <div>
          <div className="admin-eyebrow">FLUXO OPERACIONAL</div>
          <h1>Corridas</h1>
          <p>Visão consolidada das entregas criadas por todas as lojas da plataforma.</p>
        </div>
      </section>

      <section className="admin-compact-metrics">
        <article>
          <small>Últimos registros</small>
          <strong>{deliveries.length}</strong>
          <span>corridas carregadas</span>
        </article>
        <article>
          <small>Em andamento</small>
          <strong>{active}</strong>
          <span>corridas aceitas</span>
        </article>
        <article>
          <small>Buscando entregador</small>
          <strong>{searching}</strong>
          <span>ofertas abertas</span>
        </article>
        <article>
          <small>Concluídas</small>
          <strong>{completed}</strong>
          <span>entregas finalizadas</span>
        </article>
        <article>
          <small>Volume em taxas</small>
          <strong>{money(feeVolume)}</strong>
          <span>na amostra carregada</span>
        </article>
      </section>

      <section className="admin-card admin-list-card">
        <header>
          <div>
            <span className="admin-card-kicker">TODAS AS LOJAS</span>
            <h2>Histórico de corridas</h2>
          </div>
          <span className="admin-subtle-count">{cancelled} canceladas/expiradas</span>
        </header>

        <div className="admin-delivery-table">
          <div className="admin-delivery-head">
            <span>Corrida</span>
            <span>Loja</span>
            <span>Cliente</span>
            <span>Entregador</span>
            <span>Status</span>
            <span>Distância</span>
            <span>Taxa</span>
            <span>Criada</span>
          </div>

          {deliveries.map(delivery => (
            <article key={delivery.id}>
              <b>{delivery.external_order_id ? '#'+delivery.external_order_id : shortId(delivery.id)}</b>
              <span>{stores.get(delivery.store_id) ?? 'Loja'}</span>
              <span className="admin-cell-stack">
                <strong>{delivery.customer_name ?? 'Cliente'}</strong>
                <small>{delivery.delivery_address}</small>
              </span>
              <span>
                {delivery.assigned_courier_id
                  ? couriers.get(delivery.assigned_courier_id) ?? 'Entregador'
                  : '—'}
              </span>
              <em className={'admin-delivery-status '+delivery.status}>
                {statusLabel[delivery.status] ?? delivery.status}
              </em>
              <span>
                {delivery.delivery_distance_km == null
                  ? '—'
                  : Number(delivery.delivery_distance_km).toFixed(1).replace('.',',')+' km'}
              </span>
              <strong>{money(Number(delivery.delivery_fee ?? 0))}</strong>
              <small>{dateTime(delivery.created_at)}</small>
            </article>
          ))}

          {!deliveries.length ? (
            <div className="admin-empty">Nenhuma corrida registrada.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
