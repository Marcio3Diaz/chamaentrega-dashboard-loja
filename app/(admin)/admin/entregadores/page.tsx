import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'
import {
  AdminCouriersPanel,
  type AdminCourierRow,
} from '@/components/admin-couriers-panel'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

export default async function AdminCouriersPage() {
  const supabase = await createClient()

  const [
    couriersResult,
    profilesResult,
    deliveriesResult,
    storesResult,
    verificationsResult,
  ] = await Promise.all([
    supabase
      .from('couriers')
      .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at,created_at,moderation_status,moderation_reason,approved_at')
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
    supabase
      .from('courier_verifications')
      .select('courier_id,status'),
  ])

  const profiles = new Map((profilesResult.data ?? []).map(profile => [profile.id,profile]))
  const stores = new Map((storesResult.data ?? []).map(store => [store.id,store.name]))
  const verifications = new Map(
    (verificationsResult.data ?? []).map(item => [item.courier_id,item.status]),
  )
  const activeDeliveryByCourier = new Map<string,any>()

  for (const delivery of deliveriesResult.data ?? []) {
    if (!delivery.assigned_courier_id || activeDeliveryByCourier.has(delivery.assigned_courier_id)) {
      continue
    }
    activeDeliveryByCourier.set(delivery.assigned_courier_id,delivery)
  }

  const rows:AdminCourierRow[] = (couriersResult.data ?? []).map(courier => {
    const profile = profiles.get(courier.id)
    const delivery = activeDeliveryByCourier.get(courier.id)
    const storeName = delivery ? stores.get(delivery.store_id) : null

    return {
      id:courier.id,
      fullName:profile?.full_name?.trim() || 'Entregador parceiro',
      phone:profile?.phone ?? null,
      avatarUrl:profile?.avatar_url ?? null,
      vehicleType:courier.vehicle_type,
      isOnline:Boolean(courier.is_online),
      isAvailable:Boolean(courier.is_available),
      rating:Number(courier.rating ?? 0),
      totalDeliveries:Number(courier.total_deliveries ?? 0),
      currentLatitude:courier.current_latitude == null ? null : Number(courier.current_latitude),
      currentLongitude:courier.current_longitude == null ? null : Number(courier.current_longitude),
      lastLocationAt:courier.last_location_at,
      createdAt:courier.created_at,
      moderationStatus:courier.moderation_status,
      moderationReason:courier.moderation_reason,
      approvedAt:courier.approved_at,
      verificationStatus:verifications.get(courier.id) ?? null,
      activeDelivery:delivery ? {
        storeName:storeName ?? 'Loja',
        customerName:delivery.customer_name ?? 'Cliente',
        status:delivery.status,
      } : null,
    }
  })

  const pending = rows.filter(item => item.moderationStatus === 'pending').length
  const active = rows.filter(item => item.moderationStatus === 'active').length
  const suspended = rows.filter(item => item.moderationStatus === 'suspended').length
  const banned = rows.filter(item => item.moderationStatus === 'banned').length
  const online = rows.filter(item => item.moderationStatus === 'active' && item.isOnline).length
  const available = rows.filter(item =>
    item.moderationStatus === 'active' &&
    item.isOnline &&
    item.isAvailable
  ).length

  return (
    <div className="admin-page admin-couriers-v2-page">
      <section className="admin-page-head admin-page-head-v2">
        <div>
          <div className="admin-eyebrow">REDE DE ENTREGADORES</div>
          <h1>Gestão de entregadores</h1>
          <p>
            Aprove novos cadastros e controle quem pode operar na plataforma.
            Suspensões e banimentos desligam o entregador da operação imediatamente.
          </p>
        </div>

        {pending > 0 ? (
          <div className="admin-approval-callout">
            <span><Icon name="clock" size={21}/></span>
            <div>
              <small>AGUARDANDO ANÁLISE</small>
              <strong>{pending} novo{pending===1?' cadastro':'s cadastros'}</strong>
            </div>
          </div>
        ) : null}
      </section>

      <section className="admin-compact-metrics admin-store-metrics-v2">
        <article>
          <span className="metric-icon gold"><Icon name="users" size={21}/></span>
          <div>
            <small>Total de entregadores</small>
            <strong>{rows.length}</strong>
            <span>cadastros na plataforma</span>
          </div>
        </article>
        <article>
          <span className="metric-icon gold"><Icon name="clock" size={21}/></span>
          <div>
            <small>Pendentes</small>
            <strong>{pending}</strong>
            <span>aguardando aprovação</span>
          </div>
        </article>
        <article>
          <span className="metric-icon green"><Icon name="check" size={21}/></span>
          <div>
            <small>Ativos</small>
            <strong>{active}</strong>
            <span>{online} online · {available} disponíveis</span>
          </div>
        </article>
        <article>
          <span className="metric-icon blue"><Icon name="shield" size={21}/></span>
          <div>
            <small>Moderados</small>
            <strong>{suspended+banned}</strong>
            <span>{suspended} suspensos · {banned} banidos</span>
          </div>
        </article>
      </section>

      <section className="admin-card admin-list-card admin-list-card-v2">
        <header>
          <div>
            <span className="admin-card-kicker">MODERAÇÃO DA REDE</span>
            <h2>Cadastros e permissões</h2>
          </div>
          <span className="admin-live-pill"><i/> {online} ONLINE</span>
        </header>

        <AdminCouriersPanel initialCouriers={rows}/>
      </section>
    </div>
  )
}
