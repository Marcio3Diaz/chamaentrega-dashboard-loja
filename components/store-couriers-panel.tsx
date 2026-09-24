'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'
import { reviewCourierNetworkRequestAction } from '@/app/(dashboard)/entregadores/actions'

export type StoreCourierActiveDelivery = {
  id: string
  status: string
  customerName: string | null
  deliveryAddress: string
  deliveryFee: number
  estimatedMinutes: number | null
  updatedAt: string
}

export type StoreCourierRequest = {
  courierId: string
  fullName: string
  phone: string | null
  avatarUrl: string | null
  vehicleType: string | null
  rating: number
  totalDeliveries: number
  isOnline: boolean
  requestedAt: string
}

export type StoreCourier = {
  id: string
  fullName: string
  phone: string | null
  avatarUrl: string | null
  vehicleType: string | null
  isOnline: boolean
  isAvailable: boolean
  rating: number
  totalDeliveries: number
  currentLatitude: number | null
  currentLongitude: number | null
  lastLocationAt: string | null
  connectedAt: string | null
  activeDelivery: StoreCourierActiveDelivery | null
}

type Props = {
  storeId: string
  storeLatitude: number | null
  storeLongitude: number | null
  initialCouriers: StoreCourier[]
  initialRequests: StoreCourierRequest[]
}

type Filter = 'all' | 'online' | 'available' | 'route'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

const statusLabels: Record<string,string> = {
  accepted: 'Entrega aceita',
  heading_to_pickup: 'Indo retirar',
  at_pickup: 'Na loja',
  heading_to_dropoff: 'A caminho do cliente',
  at_dropoff: 'No cliente',
}

function vehicleLabel(value: string | null) {
  if (value === 'bike') return 'Bicicleta'
  if (value === 'motorcycle') return 'Moto'
  if (value === 'car') return 'Carro'
  return 'Veículo'
}

function gpsAge(value: string | null, now: number) {
  if (!value) return { label: 'Sem posição GPS', stale: true }

  const diff = Math.max(0, now - new Date(value).getTime())
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return { label: 'GPS agora', stale: false }
  if (minutes < 60) return { label: `GPS há ${minutes} min`, stale: minutes >= 10 }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { label: `GPS há ${hours} h`, stale: true }

  return { label: `GPS há ${Math.floor(hours / 24)} dias`, stale: true }
}

function connectedLabel(value: string | null) {
  if (!value) return 'Rede conectada'
  return `Na rede desde ${new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))}`
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function shortId(value: string) {
  return value.replaceAll('-', '').slice(0,7).toUpperCase()
}

function distanceKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null

  const toRad = (value: number) => value * Math.PI / 180
  const earth = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2

  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function StoreCouriersPanel({
  storeId,
  storeLatitude,
  storeLongitude,
  initialCouriers,
  initialRequests,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [couriers, setCouriers] = useState(initialCouriers)
  const [requests, setRequests] = useState(initialRequests)
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set())
  const [reviewMessage, setReviewMessage] = useState('')
  const [, startReviewTransition] = useTransition()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [liveState, setLiveState] = useState('CONECTANDO')
  const [now, setNow] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    const { data: networkRows } = await supabase
      .from('courier_store_networks')
      .select('courier_id,status,created_at,updated_at')
      .eq('store_id', storeId)
      .eq('status', 'connected')
      .order('created_at', { ascending: true })

    const courierIds = (networkRows ?? []).map(item => item.courier_id)

    if (!courierIds.length) {
      setCouriers([])
      return
    }

    const [{ data: courierRows }, { data: profileRows }, { data: deliveryRows }] = await Promise.all([
      supabase
        .from('couriers')
        .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
        .in('id', courierIds),
      supabase
        .from('profiles')
        .select('id,full_name,phone,avatar_url')
        .in('id', courierIds),
      supabase
        .from('deliveries')
        .select('id,assigned_courier_id,status,customer_name,delivery_address,delivery_fee,estimated_minutes,updated_at')
        .eq('store_id', storeId)
        .in('status', activeStatuses)
        .in('assigned_courier_id', courierIds)
        .order('updated_at', { ascending: false }),
    ])

    const networkMap = new Map((networkRows ?? []).map(item => [item.courier_id,item]))
    const profileMap = new Map((profileRows ?? []).map(item => [item.id,item]))
    const deliveryMap = new Map<string,StoreCourierActiveDelivery>()

    for (const delivery of deliveryRows ?? []) {
      if (!delivery.assigned_courier_id || deliveryMap.has(delivery.assigned_courier_id)) continue
      deliveryMap.set(delivery.assigned_courier_id, {
        id: delivery.id,
        status: delivery.status,
        customerName: delivery.customer_name,
        deliveryAddress: delivery.delivery_address,
        deliveryFee: Number(delivery.delivery_fee ?? 0),
        estimatedMinutes: delivery.estimated_minutes == null ? null : Number(delivery.estimated_minutes),
        updatedAt: delivery.updated_at,
      })
    }

    setCouriers((courierRows ?? []).map((item: any) => {
      const profile = profileMap.get(item.id)
      const network = networkMap.get(item.id)

      return {
        id: item.id,
        fullName: profile?.full_name?.trim() || 'Entregador parceiro',
        phone: profile?.phone ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        vehicleType: item.vehicle_type,
        isOnline: Boolean(item.is_online),
        isAvailable: Boolean(item.is_available),
        rating: Number(item.rating ?? 0),
        totalDeliveries: Number(item.total_deliveries ?? 0),
        currentLatitude: item.current_latitude == null ? null : Number(item.current_latitude),
        currentLongitude: item.current_longitude == null ? null : Number(item.current_longitude),
        lastLocationAt: item.last_location_at,
        connectedAt: network?.created_at ?? null,
        activeDelivery: deliveryMap.get(item.id) ?? null,
      }
    }))
  }, [storeId, supabase])

  useEffect(() => {
    setCouriers(initialCouriers)
  }, [initialCouriers])

  useEffect(() => {
    setRequests(initialRequests)
  }, [initialRequests])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const courierChannel = supabase
      .channel(`store-couriers-page:${storeId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couriers' },
        payload => {
          const row = payload.new as any
          setCouriers(current => current.map(courier =>
            courier.id !== row.id
              ? courier
              : {
                  ...courier,
                  vehicleType: row.vehicle_type ?? courier.vehicleType,
                  isOnline: Boolean(row.is_online),
                  isAvailable: Boolean(row.is_available),
                  rating: Number(row.rating ?? courier.rating),
                  totalDeliveries: Number(row.total_deliveries ?? courier.totalDeliveries),
                  currentLatitude: row.current_latitude == null ? null : Number(row.current_latitude),
                  currentLongitude: row.current_longitude == null ? null : Number(row.current_longitude),
                  lastLocationAt: row.last_location_at ?? courier.lastLocationAt,
                },
          ))
        },
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setLiveState('AO VIVO')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveState('RECONECTANDO')
      })

    const deliveriesChannel = supabase
      .channel(`store-courier-deliveries:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
          filter: `store_id=eq.${storeId}`,
        },
        () => void refresh(),
      )
      .subscribe()

    const networksChannel = supabase
      .channel(`store-courier-networks:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'courier_store_networks',
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          router.refresh()
          void refresh()
        },
      )
      .subscribe()

    const poll = window.setInterval(() => void refresh(), 30000)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(courierChannel)
      void supabase.removeChannel(deliveriesChannel)
      void supabase.removeChannel(networksChannel)
    }
  }, [refresh, router, storeId, supabase])

  const stats = useMemo(() => ({
    connected: couriers.length,
    online: couriers.filter(item => item.isOnline).length,
    available: couriers.filter(item => item.isOnline && item.isAvailable && !item.activeDelivery).length,
    routes: couriers.filter(item => item.activeDelivery).length,
  }), [couriers])

  const shown = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')

    return couriers
      .filter(courier => {
        if (filter === 'online' && !courier.isOnline) return false
        if (filter === 'available' && !(courier.isOnline && courier.isAvailable && !courier.activeDelivery)) return false
        if (filter === 'route' && !courier.activeDelivery) return false

        if (!query) return true

        return [
          courier.fullName,
          vehicleLabel(courier.vehicleType),
          courier.activeDelivery?.customerName ?? '',
          courier.activeDelivery?.deliveryAddress ?? '',
        ].some(value => value.toLocaleLowerCase('pt-BR').includes(query))
      })
      .sort((a,b) => {
        if (Boolean(a.activeDelivery) !== Boolean(b.activeDelivery)) return a.activeDelivery ? -1 : 1
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1

        const distanceA = distanceKm(storeLatitude,storeLongitude,a.currentLatitude,a.currentLongitude)
        const distanceB = distanceKm(storeLatitude,storeLongitude,b.currentLatitude,b.currentLongitude)

        if (distanceA != null && distanceB != null && Math.abs(distanceA - distanceB) > 0.05) {
          return distanceA - distanceB
        }

        return a.fullName.localeCompare(b.fullName, 'pt-BR')
      })
  }, [couriers, filter, search, storeLatitude, storeLongitude])


  async function manualRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refresh()
      router.refresh()
    } finally {
      setRefreshing(false)
    }
  }

  function reviewRequest(
    courierId: string,
    decision: 'connected' | 'rejected',
  ) {
    if (reviewingIds.has(courierId)) return

    setReviewMessage('')
    setReviewingIds(current => new Set(current).add(courierId))

    startReviewTransition(async () => {
      const result = await reviewCourierNetworkRequestAction(
        storeId,
        courierId,
        decision,
      )

      setReviewMessage(result.message)

      if (result.ok) {
        setRequests(current =>
          current.filter(request => request.courierId !== courierId),
        )
        router.refresh()
        void refresh()
      }

      setReviewingIds(current => {
        const next = new Set(current)
        next.delete(courierId)
        return next
      })
    })
  }

  function requestedLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  }

  return (
    <div className="couriers-page">
      <section className="couriers-page-head">
        <div>
          <div className="eyebrow">REDE DE ENTREGADORES</div>
          <h1>Entregadores</h1>
          <p>Acompanhe sua rede conectada, disponibilidade, corridas e localização em tempo real.</p>
        </div>

        <div className="couriers-head-actions">
          <span className={`couriers-live-pill ${liveState === 'AO VIVO' ? 'online' : ''}`}><i />{liveState}</span>
          <button
            type="button"
            className="couriers-refresh-button"
            onClick={() => void manualRefresh()}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <Icon name="activity" size={16}/> {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <Link href="/entregas/nova" className="couriers-new-delivery-button"><Icon name="plus" size={16}/> Nova entrega</Link>
          <Link href="/mapa" className="couriers-map-button"><Icon name="map" size={16}/> Mapa ao vivo</Link>
        </div>
      </section>

      <section className="couriers-stats">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          <span className="couriers-stat-icon gold"><Icon name="user" size={20}/></span>
          <div><small>Rede conectada</small><strong>{stats.connected}</strong><span>entregadores parceiros</span></div>
          <Icon name="chevron" size={18}/>
        </button>
        <button type="button" className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>
          <span className="couriers-stat-icon green">●</span>
          <div><small>Online agora</small><strong>{stats.online}</strong><span>conectados ao app</span></div>
          <Icon name="chevron" size={18}/>
        </button>
        <button type="button" className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')}>
          <span className="couriers-stat-icon blue"><Icon name="lightning" size={20}/></span>
          <div><small>Disponíveis</small><strong>{stats.available}</strong><span>prontos para oferta</span></div>
          <Icon name="chevron" size={18}/>
        </button>
        <button type="button" className={filter === 'route' ? 'active' : ''} onClick={() => setFilter('route')}>
          <span className="couriers-stat-icon amber"><Icon name="truck" size={20}/></span>
          <div><small>Em rota</small><strong>{stats.routes}</strong><span>com corrida ativa</span></div>
          <Icon name="chevron" size={18}/>
        </button>
      </section>


      <section className="courier-network-requests">
        <div className="courier-network-requests-head">
          <div>
            <span className="eyebrow">REDE PARTICULAR DA LOJA</span>
            <h2>Solicitações de entrada</h2>
            <p>
              Entregadores podem encontrar sua loja no app e pedir para entrar na rede particular.
            </p>
          </div>
          <span className={requests.length ? 'network-request-count active' : 'network-request-count'}>
            {requests.length} pendente{requests.length === 1 ? '' : 's'}
          </span>
        </div>

        {reviewMessage ? (
          <div className="network-review-message">{reviewMessage}</div>
        ) : null}

        {requests.length ? (
          <div className="courier-network-request-list">
            {requests.map(request => {
              const busy = reviewingIds.has(request.courierId)

              return (
                <article key={request.courierId}>
                  <span className="network-request-avatar">
                    {request.avatarUrl
                      ? <img src={request.avatarUrl} alt="" />
                      : request.fullName.slice(0,1).toUpperCase()}
                    <i className={request.isOnline ? 'online' : ''}/>
                  </span>

                  <span className="network-request-person">
                    <strong>{request.fullName}</strong>
                    <small>
                      {vehicleLabel(request.vehicleType)} · ★ {request.rating.toFixed(1)}
                    </small>
                    <em>
                      {request.totalDeliveries} entregas · solicitado em {requestedLabel(request.requestedAt)}
                    </em>
                  </span>

                  <span className="network-request-contact">
                    <small>Contato</small>
                    {request.phone ? (
                      <a href={`tel:${request.phone.replace(/\D/g,'')}`} title="Ligar para o entregador">
                        <strong>{request.phone}</strong>
                      </a>
                    ) : (
                      <strong>Não informado</strong>
                    )}
                  </span>

                  <div className="network-request-actions">
                    <button
                      type="button"
                      className="reject"
                      disabled={busy}
                      onClick={() => reviewRequest(request.courierId,'rejected')}
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      className="approve"
                      disabled={busy}
                      onClick={() => reviewRequest(request.courierId,'connected')}
                    >
                      <Icon name="check" size={14}/>
                      Aprovar na rede
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="network-requests-empty">
            <span><Icon name="users" size={22}/></span>
            <div>
              <strong>Nenhuma solicitação pendente</strong>
              <p>Quando um entregador tocar em “Solicitar entrada” no app, ele aparecerá aqui.</p>
            </div>
          </div>
        )}
      </section>

      <section className="couriers-list-card">
        <div className="couriers-toolbar">
          <div>
            <strong>Sua rede</strong>
            <span>{shown.length} de {couriers.length} entregador{couriers.length === 1 ? '' : 'es'}</span>
          </div>

          <div className="couriers-toolbar-controls">
            <label className="couriers-search">
              <span>⌕</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar entregador..." />
            </label>

            <div className="couriers-filters">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
              <button className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>Online</button>
              <button className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')}>Disponíveis</button>
              <button className={filter === 'route' ? 'active' : ''} onClick={() => setFilter('route')}>Em rota</button>
            </div>
          </div>
        </div>

        <div className="couriers-grid">
          {shown.length ? shown.map(courier => {
            const gps = gpsAge(courier.lastLocationAt, now)
            const delivery = courier.activeDelivery
            const distance = distanceKm(
              storeLatitude,
              storeLongitude,
              courier.currentLatitude,
              courier.currentLongitude,
            )
            const availabilityLabel = delivery
              ? statusLabels[delivery.status] ?? 'Em rota'
              : courier.isOnline
                ? courier.isAvailable ? 'Disponível' : 'Online · ocupado'
                : 'Offline'

            return (
              <article key={courier.id} className={`courier-card ${delivery ? 'in-route' : ''}`}>
                <div className="courier-card-top">
                  <div className="courier-card-person">
                    <span className="courier-card-avatar">
                      {courier.avatarUrl
                        ? <img src={courier.avatarUrl} alt="" />
                        : <span>{courier.fullName.slice(0,1).toUpperCase()}</span>}
                      <i className={courier.isOnline ? 'online' : ''} />
                    </span>
                    <span className="courier-card-name">
                      <strong>{courier.fullName}</strong>
                      <small>{vehicleLabel(courier.vehicleType)} · ★ {courier.rating.toFixed(1)}</small>
                      <span>{connectedLabel(courier.connectedAt)}</span>
                    </span>
                  </div>

                  <span className={`courier-status-pill ${delivery ? 'route' : courier.isOnline && courier.isAvailable ? 'available' : courier.isOnline ? 'online' : 'offline'}`}>
                    {availabilityLabel}
                  </span>
                </div>

                <div className="courier-card-metrics">
                  <div><small>Entregas</small><strong>{courier.totalDeliveries}</strong></div>
                  <div><small>Avaliação</small><strong>★ {courier.rating.toFixed(1)}</strong></div>
                  <div>
                    <small>Distância da loja</small>
                    <strong>{distance == null ? '—' : distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1).replace('.', ',') + ' km'}</strong>
                  </div>
                  <div>
                    <small>Localização</small>
                    <strong className={gps.stale ? 'stale' : ''}>{gps.label}</strong>
                  </div>
                </div>

                {delivery ? (
                  <div className="courier-active-delivery">
                    <div className="courier-route-head">
                      <span><Icon name="box" size={14}/> Corrida ativa</span>
                      <strong>#{shortId(delivery.id)}</strong>
                    </div>
                    <div className="courier-route-customer">
                      <strong>{delivery.customerName?.trim() || 'Cliente'}</strong>
                      <span>{delivery.deliveryAddress}</span>
                    </div>
                    <div className="courier-route-meta">
                      <span>{money(delivery.deliveryFee)}</span>
                      <span>{delivery.estimatedMinutes ? `~${delivery.estimatedMinutes} min` : 'Tempo calculando'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="courier-no-route">
                    <Icon name="check" size={17}/>
                    <span>{courier.isOnline && courier.isAvailable ? 'Pronto para receber novas ofertas.' : 'Sem corrida ativa no momento.'}</span>
                  </div>
                )}

                <div className="courier-card-actions">
                  {courier.phone ? (
                    <>
                      <a
                        href={`tel:${courier.phone.replace(/\D/g,'')}`}
                        className="secondary"
                        title="Chamar entregador"
                      >
                        <Icon name="phone" size={16}/> Chamar
                      </a>
                      <a
                        href={`https://wa.me/55${courier.phone.replace(/\D/g,'').replace(/^55/,'')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="secondary"
                        title="Abrir conversa no WhatsApp"
                      >
                        <Icon name="chat" size={16}/> Mensagem
                      </a>
                    </>
                  ) : (
                    <>
                      <button type="button" className="secondary" disabled title="Telefone não informado">
                        <Icon name="phone" size={16}/> Chamar
                      </button>
                      <button type="button" className="secondary" disabled title="Telefone não informado">
                        <Icon name="chat" size={16}/> Mensagem
                      </button>
                    </>
                  )}
                  <Link
                    href={`/mapa?courier=${courier.id}`}
                    className="secondary"
                    title="Abrir localização do entregador no mapa"
                  >
                    <Icon name="pin" size={16}/> Ver no mapa
                  </Link>
                  {delivery ? (
                    <Link href={`/chat?delivery=${delivery.id}`} className="primary" title="Abrir chat da corrida">
                      <Icon name="chat" size={16}/> Chat da corrida
                    </Link>
                  ) : (
                    <Link href="/entregas/nova" className="primary" title="Criar uma nova entrega">
                      <Icon name="plus" size={16}/> Nova entrega
                    </Link>
                  )}
                </div>
              </article>
            )
          }) : (
            <div className="couriers-empty">
              <span className="couriers-empty-icon"><Icon name="user" size={26}/></span>
              <strong>Nenhum entregador neste filtro</strong>
              <span>Os entregadores conectados à rede da loja aparecerão aqui.</span>
            </div>
          )}
        </div>
      </section>
      <style jsx global>{`
        /* Entregadores: versão compacta e legível — 24/09/2026 */
        .couriers-page {
          width: 100%;
          padding: 14px 18px 24px !important;
          color: #171717;
          font-size: 14px;
        }

        .couriers-page-head {
          min-height: 0 !important;
          margin: 0 !important;
          padding: 16px 18px !important;
          gap: 16px !important;
          border: 1px solid #eadfce !important;
          border-radius: 16px !important;
          background: #fffaf2 !important;
          box-shadow: 0 6px 20px rgba(87, 64, 24, .035) !important;
          align-items: center !important;
        }

        .couriers-page-head .eyebrow,
        .courier-network-requests .eyebrow {
          font-size: 11px !important;
          line-height: 1.1 !important;
          letter-spacing: .11em !important;
          font-weight: 900 !important;
          color: #b97600 !important;
        }

        .couriers-page-head h1 {
          margin: 4px 0 4px !important;
          font-size: 31px !important;
          line-height: 1 !important;
          letter-spacing: -1px !important;
          color: #151515 !important;
        }

        .couriers-page-head p {
          margin: 0 !important;
          font-size: 13px !important;
          line-height: 1.35 !important;
          color: #706a61 !important;
        }

        .couriers-head-actions {
          gap: 8px !important;
          flex-wrap: wrap !important;
          justify-content: flex-end !important;
        }

        .couriers-live-pill,
        .couriers-refresh-button,
        .couriers-new-delivery-button,
        .couriers-map-button {
          min-height: 38px !important;
          height: 38px !important;
          padding: 0 13px !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          font-weight: 850 !important;
          line-height: 1 !important;
        }

        .couriers-refresh-button:disabled {
          opacity: .65 !important;
        }

        .couriers-stats {
          margin-top: 10px !important;
          gap: 10px !important;
        }

        .couriers-stats > button {
          min-height: 78px !important;
          height: 78px !important;
          padding: 10px 13px !important;
          gap: 10px !important;
          border-radius: 14px !important;
          background: #fffdf8 !important;
          border-color: #eadfce !important;
        }

        .couriers-stats > button.active {
          border-color: #efb222 !important;
          box-shadow: inset 0 0 0 1px rgba(239,178,34,.22) !important;
        }

        .couriers-stat-icon {
          width: 42px !important;
          height: 42px !important;
          min-width: 42px !important;
          border-radius: 12px !important;
        }

        .couriers-stats small {
          font-size: 12px !important;
          line-height: 1.1 !important;
          color: #5f5a52 !important;
        }

        .couriers-stats strong {
          margin-top: 2px !important;
          font-size: 27px !important;
          line-height: 1 !important;
          color: #111 !important;
        }

        .couriers-stats span:not(.couriers-stat-icon) {
          margin-top: 3px !important;
          font-size: 11px !important;
          line-height: 1.1 !important;
          color: #777168 !important;
        }

        .courier-network-requests {
          margin-top: 10px !important;
          border-radius: 15px !important;
          border-color: #eadfce !important;
          background: #fffdf9 !important;
        }

        .courier-network-requests-head {
          min-height: 0 !important;
          padding: 12px 14px !important;
          gap: 14px !important;
        }

        .courier-network-requests-head h2 {
          margin: 3px 0 2px !important;
          font-size: 20px !important;
          line-height: 1.05 !important;
          color: #171717 !important;
        }

        .courier-network-requests-head p {
          margin: 0 !important;
          font-size: 12px !important;
          line-height: 1.25 !important;
          color: #766f65 !important;
        }

        .network-request-count {
          min-height: 30px !important;
          padding: 0 12px !important;
          font-size: 11px !important;
        }

        .courier-network-request-list {
          gap: 7px !important;
          padding: 0 10px 10px !important;
        }

        .courier-network-request-list article {
          min-height: 68px !important;
          padding: 9px 12px !important;
          gap: 12px !important;
          border-radius: 12px !important;
        }

        .network-request-avatar {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          font-size: 15px !important;
        }

        .network-request-person strong,
        .network-request-contact strong {
          font-size: 13px !important;
          line-height: 1.15 !important;
        }

        .network-request-person small,
        .network-request-person em,
        .network-request-contact small {
          font-size: 11px !important;
          line-height: 1.2 !important;
        }

        .network-request-contact a {
          color: inherit !important;
          text-decoration: none !important;
        }

        .network-request-contact a:hover strong {
          text-decoration: underline !important;
        }

        .network-request-actions {
          gap: 7px !important;
        }

        .network-request-actions button {
          min-height: 36px !important;
          height: 36px !important;
          padding: 0 12px !important;
          border-radius: 9px !important;
          font-size: 12px !important;
          font-weight: 850 !important;
        }

        .network-review-message {
          margin: 0 10px 8px !important;
          padding: 8px 10px !important;
          font-size: 12px !important;
        }

        .couriers-list-card {
          margin-top: 10px !important;
          border-radius: 15px !important;
          border-color: #eadfce !important;
          background: #fffdf9 !important;
        }

        .couriers-toolbar {
          min-height: 56px !important;
          padding: 9px 12px !important;
          gap: 12px !important;
        }

        .couriers-toolbar > div:first-child > strong {
          font-size: 20px !important;
          line-height: 1 !important;
          color: #171717 !important;
        }

        .couriers-toolbar > div:first-child > span {
          margin-top: 3px !important;
          font-size: 11px !important;
          color: #777168 !important;
        }

        .couriers-toolbar-controls {
          gap: 8px !important;
        }

        .couriers-search {
          min-width: 250px !important;
          height: 38px !important;
          border-radius: 9px !important;
        }

        .couriers-search input {
          font-size: 12px !important;
        }

        .couriers-filters {
          gap: 5px !important;
        }

        .couriers-filters button {
          min-height: 36px !important;
          height: 36px !important;
          padding: 0 12px !important;
          border-radius: 8px !important;
          font-size: 12px !important;
          font-weight: 800 !important;
        }

        .couriers-grid {
          padding: 10px !important;
          gap: 8px !important;
        }

        .couriers-grid .courier-card {
          border-radius: 13px !important;
          border-color: #eddfc7 !important;
          background: #fffdfa !important;
          overflow: hidden !important;
        }

        .courier-card-top {
          min-height: 0 !important;
          padding: 10px 12px 8px !important;
          gap: 10px !important;
          align-items: center !important;
        }

        .courier-card-person {
          gap: 10px !important;
        }

        .courier-card-avatar {
          width: 50px !important;
          height: 50px !important;
          min-width: 50px !important;
        }

        .courier-card-name strong {
          font-size: 16px !important;
          line-height: 1.05 !important;
          color: #171717 !important;
        }

        .courier-card-name small {
          margin-top: 3px !important;
          font-size: 12px !important;
          line-height: 1.15 !important;
        }

        .courier-card-name > span {
          margin-top: 3px !important;
          font-size: 10px !important;
          line-height: 1.1 !important;
        }

        .courier-status-pill {
          min-height: 30px !important;
          height: 30px !important;
          padding: 0 11px !important;
          border-radius: 999px !important;
          font-size: 11px !important;
          font-weight: 850 !important;
        }

        .courier-card-metrics {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          margin: 0 12px !important;
          min-height: 50px !important;
          border-radius: 9px !important;
          overflow: hidden !important;
        }

        .courier-card-metrics > div {
          min-height: 50px !important;
          padding: 8px 11px !important;
        }

        .courier-card-metrics small {
          font-size: 10px !important;
          line-height: 1.05 !important;
        }

        .courier-card-metrics strong {
          margin-top: 3px !important;
          font-size: 13px !important;
          line-height: 1.05 !important;
        }

        .courier-active-delivery {
          margin: 8px 12px 0 !important;
          padding: 8px 10px !important;
          border-radius: 10px !important;
          display: grid !important;
          grid-template-columns: minmax(150px,.7fr) minmax(260px,1.5fr) auto !important;
          align-items: center !important;
          gap: 10px !important;
        }

        .courier-route-head {
          display: flex !important;
          flex-direction: column !important;
          gap: 2px !important;
        }

        .courier-route-head span,
        .courier-route-head strong {
          font-size: 10px !important;
          line-height: 1.15 !important;
        }

        .courier-route-customer strong {
          font-size: 13px !important;
          line-height: 1.1 !important;
        }

        .courier-route-customer span {
          margin-top: 2px !important;
          font-size: 10px !important;
          line-height: 1.15 !important;
        }

        .courier-route-meta {
          gap: 8px !important;
          font-size: 11px !important;
          white-space: nowrap !important;
        }

        .courier-no-route {
          margin: 8px 12px 0 !important;
          min-height: 34px !important;
          padding: 7px 10px !important;
          border-radius: 9px !important;
          font-size: 11px !important;
        }

        .courier-card-actions {
          padding: 8px 12px 10px !important;
          gap: 6px !important;
          flex-wrap: wrap !important;
          justify-content: flex-end !important;
        }

        .courier-card-actions a,
        .courier-card-actions button {
          min-height: 36px !important;
          height: 36px !important;
          padding: 0 11px !important;
          border-radius: 9px !important;
          font-size: 12px !important;
          font-weight: 850 !important;
          line-height: 1 !important;
        }

        .courier-card-actions button.secondary {
          border: 1px solid #ddd2c2 !important;
          background: #fff !important;
          color: #7f786e !important;
        }

        .courier-card-actions button:disabled {
          opacity: .48 !important;
          cursor: not-allowed !important;
        }

        .couriers-empty {
          min-height: 150px !important;
          padding: 24px !important;
        }

        @media (max-width: 1180px) {
          .couriers-page-head {
            align-items: flex-start !important;
            flex-direction: column !important;
          }

          .couriers-head-actions {
            justify-content: flex-start !important;
          }

          .couriers-stats {
            grid-template-columns: repeat(2, minmax(0,1fr)) !important;
          }

          .courier-active-delivery {
            grid-template-columns: 1fr 1.4fr !important;
          }

          .courier-route-meta {
            grid-column: 1 / -1 !important;
          }
        }

        @media (max-width: 760px) {
          .couriers-page {
            padding: 10px 10px 90px !important;
          }

          .couriers-page-head {
            padding: 14px !important;
          }

          .couriers-page-head h1 {
            font-size: 28px !important;
          }

          .couriers-head-actions > * {
            flex: 1 1 calc(50% - 5px) !important;
          }

          .couriers-stats {
            grid-template-columns: 1fr 1fr !important;
          }

          .couriers-stats > button {
            height: auto !important;
            min-height: 82px !important;
          }

          .courier-network-request-list article {
            grid-template-columns: auto 1fr !important;
          }

          .network-request-contact,
          .network-request-actions {
            grid-column: 1 / -1 !important;
          }

          .couriers-toolbar {
            align-items: stretch !important;
            flex-direction: column !important;
          }

          .couriers-toolbar-controls {
            width: 100% !important;
            align-items: stretch !important;
            flex-direction: column !important;
          }

          .couriers-search {
            min-width: 0 !important;
            width: 100% !important;
          }

          .couriers-filters {
            overflow-x: auto !important;
          }

          .courier-card-metrics {
            grid-template-columns: repeat(2, minmax(0,1fr)) !important;
          }

          .courier-active-delivery {
            grid-template-columns: 1fr !important;
          }

          .courier-card-actions {
            justify-content: stretch !important;
          }

          .courier-card-actions a,
          .courier-card-actions button {
            flex: 1 1 calc(50% - 4px) !important;
          }
        }
      `}</style>

    </div>
  )
}
