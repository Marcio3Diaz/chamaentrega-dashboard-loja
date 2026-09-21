import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

function dateTime(value:string|null) {
  if (!value) return 'Sem GPS'
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
  }).format(new Date(value))
}

export default async function AdminCouriersPage() {
  const supabase = await createClient()

  const [
    couriersResult,
    profilesResult,
    deliveriesResult,
    storesResult,
  ] = await Promise.all([
    supabase
      .from('couriers')
      .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at,created_at')
      .order('created_at',{ascending:false}),
    supabase
      .from('profiles')
      .select('id,full_name,phone,avatar_url')
      .eq('role','courier'),
    supabase
      .from('deliveries')
      .select('id,assigned_courier_id,store_id,status,customer_name,delivery_address,updated_at')
      .in('status',activeStatuses)
      .not('assigned_courier_id','is',null)
      .order('updated_at',{ascending:false}),
    supabase
      .from('stores')
      .select('id,name'),
  ])

  const profiles = new Map((profilesResult.data ?? []).map(profile => [profile.id,profile]))
  const stores = new Map((storesResult.data ?? []).map(store => [store.id,store.name]))
  const activeDeliveryByCourier = new Map<string,any>()

  for (const delivery of deliveriesResult.data ?? []) {
    if (!delivery.assigned_courier_id || activeDeliveryByCourier.has(delivery.assigned_courier_id)) continue
    activeDeliveryByCourier.set(delivery.assigned_courier_id,delivery)
  }

  const couriers = couriersResult.data ?? []
  const online = couriers.filter(courier => courier.is_online).length
  const available = couriers.filter(courier => courier.is_online && courier.is_available).length
  const onRoute = couriers.filter(courier => activeDeliveryByCourier.has(courier.id)).length
  const averageRating = couriers.length
    ? couriers.reduce((sum,courier) => sum+Number(courier.rating ?? 0),0)/couriers.length
    : 0

  return (
    <div className="admin-page">
      <section className="admin-page-head">
        <div>
          <div className="admin-eyebrow">REDE DE ENTREGADORES</div>
          <h1>Entregadores</h1>
          <p>Acompanhe disponibilidade, avaliações, localização e corridas ativas da rede.</p>
        </div>
      </section>

      <section className="admin-compact-metrics">
        <article>
          <small>Cadastrados</small>
          <strong>{couriers.length}</strong>
          <span>entregadores na plataforma</span>
        </article>
        <article>
          <small>Online agora</small>
          <strong>{online}</strong>
          <span>conectados ao aplicativo</span>
        </article>
        <article>
          <small>Disponíveis</small>
          <strong>{available}</strong>
          <span>prontos para novas ofertas</span>
        </article>
        <article>
          <small>Em rota</small>
          <strong>{onRoute}</strong>
          <span>com entrega ativa</span>
        </article>
        <article>
          <small>Avaliação média</small>
          <strong>{averageRating ? averageRating.toFixed(1) : '—'}</strong>
          <span>média da rede</span>
        </article>
      </section>

      <section className="admin-card admin-list-card">
        <header>
          <div>
            <span className="admin-card-kicker">ENTREGADORES</span>
            <h2>Rede cadastrada</h2>
          </div>
          <span className="admin-live-pill"><i/> {online} ONLINE</span>
        </header>

        <div className="admin-courier-list">
          {couriers.map(courier => {
            const profile = profiles.get(courier.id)
            const delivery = activeDeliveryByCourier.get(courier.id)
            const storeName = delivery ? stores.get(delivery.store_id) : null

            return (
              <article className="admin-courier-row" key={courier.id}>
                <div className="admin-courier-id">
                  <span className="admin-courier-avatar">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt=""/>
                      : (profile?.full_name?.slice(0,1) ?? 'E')}
                  </span>
                  <span>
                    <strong>{profile?.full_name ?? 'Entregador parceiro'}</strong>
                    <small>{profile?.phone ?? 'Telefone não informado'}</small>
                    <em>
                      {courier.vehicle_type === 'bike' ? 'Bicicleta' : 'Motocicleta'}
                    </em>
                  </span>
                </div>

                <div className="admin-courier-stat">
                  <small>Avaliação</small>
                  <strong>★ {Number(courier.rating ?? 0).toFixed(1)}</strong>
                  <span>{courier.total_deliveries ?? 0} entregas</span>
                </div>

                <div className="admin-courier-stat">
                  <small>GPS</small>
                  <strong>{courier.current_latitude != null ? 'Disponível' : 'Sem posição'}</strong>
                  <span>{dateTime(courier.last_location_at)}</span>
                </div>

                <div className="admin-courier-current">
                  {delivery ? (
                    <>
                      <small>CORRIDA ATIVA</small>
                      <strong>{storeName ?? 'Loja'}</strong>
                      <span>{delivery.customer_name ?? 'Cliente'} · {delivery.status}</span>
                    </>
                  ) : (
                    <>
                      <small>OPERAÇÃO</small>
                      <strong>{courier.is_online ? (courier.is_available ? 'Disponível' : 'Ocupado') : 'Offline'}</strong>
                      <span>Sem corrida ativa</span>
                    </>
                  )}
                </div>

                <span className={
                  courier.is_online
                    ? courier.is_available
                      ? 'admin-status active'
                      : 'admin-status busy'
                    : 'admin-status paused'
                }>
                  <i/>
                  {courier.is_online
                    ? courier.is_available
                      ? 'Disponível'
                      : 'Online'
                    : 'Offline'}
                </span>
              </article>
            )
          })}

          {!couriers.length ? (
            <div className="admin-empty">
              <Icon name="user" size={24}/>
              Nenhum entregador cadastrado.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
