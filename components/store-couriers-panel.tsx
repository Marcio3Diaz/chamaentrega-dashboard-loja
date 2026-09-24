'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'

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
  storeName: string
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
  storeName,
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
  const [reviewingActions, setReviewingActions] = useState<Record<string,'connected'|'rejected'>>({})
  const [reviewMessage, setReviewMessage] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [liveState, setLiveState] = useState('CONECTANDO')
  const [now, setNow] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [expandedCourierId, setExpandedCourierId] = useState<string | null>(null)

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

  async function reviewRequest(
    courierId: string,
    decision: 'connected' | 'rejected',
  ) {
    if (reviewingIds.has(courierId)) return

    setReviewMessage('')
    setReviewingIds(current => new Set(current).add(courierId))
    setReviewingActions(current => ({ ...current, [courierId]: decision }))

    try {
      const { error } = await supabase.rpc('review_courier_store_network_request', {
        p_store_id: storeId,
        p_courier_id: courierId,
        p_decision: decision,
        p_note: null,
      })

      if (error) {
        const raw = error.message ?? ''

        if (raw.includes('REQUEST_ALREADY_REVIEWED')) {
          setReviewMessage('Esta solicitação já foi analisada.')
        } else if (raw.includes('REQUEST_NOT_FOUND')) {
          setReviewMessage('Solicitação não encontrada.')
        } else if (raw.includes('STORE_ACCESS_REQUIRED')) {
          setReviewMessage('A sessão atual não tem permissão para analisar esta solicitação.')
        } else {
          setReviewMessage(`Erro ao ${decision === 'connected' ? 'aprovar' : 'recusar'}: ${raw || 'tente novamente.'}`)
        }
        return
      }

      setRequests(current =>
        current.filter(request => request.courierId !== courierId),
      )

      setReviewMessage(
        decision === 'connected'
          ? 'Entregador aprovado e adicionado à rede da loja.'
          : 'Solicitação recusada.',
      )

      await refresh()
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha inesperada.'
      setReviewMessage(`Não foi possível concluir a ação: ${message}`)
    } finally {
      setReviewingIds(current => {
        const next = new Set(current)
        next.delete(courierId)
        return next
      })
      setReviewingActions(current => {
        const next = { ...current }
        delete next[courierId]
        return next
      })
    }
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
    <div className="ce2-page">
      <section className="ce2-head">
        <div className="ce2-head-copy">
          <div className="ce2-eyebrow">REDE DE ENTREGADORES</div>
          <h1>Entregadores</h1>
          <p>Acompanhe sua rede conectada, disponibilidade, corridas e localização em tempo real.</p>
        </div>

        <div className="ce2-head-actions">
          <span className={`ce2-live ${liveState === 'AO VIVO' ? 'online' : ''}`}><i />{liveState}</span>
          <button type="button" className="ce2-btn ghost" onClick={() => void manualRefresh()} disabled={refreshing}>
            <Icon name="activity" size={17}/> {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <Link href="/entregas/nova" className="ce2-btn gold"><Icon name="plus" size={18}/> Nova entrega</Link>
          <Link href="/mapa" className="ce2-btn ghost"><Icon name="map" size={17}/> Mapa ao vivo</Link>
        </div>
      </section>

      <section className="ce2-stats">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          <span className="ce2-stat-icon gold"><Icon name="user" size={22}/></span>
          <span className="ce2-stat-copy"><small>Rede conectada</small><strong>{stats.connected}</strong><em>entregadores parceiros</em></span>
          <Icon name="chevron" size={20}/>
        </button>
        <button type="button" className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>
          <span className="ce2-stat-icon green">●</span>
          <span className="ce2-stat-copy"><small>Online agora</small><strong>{stats.online}</strong><em>conectados ao app</em></span>
          <Icon name="chevron" size={20}/>
        </button>
        <button type="button" className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')}>
          <span className="ce2-stat-icon blue"><Icon name="lightning" size={22}/></span>
          <span className="ce2-stat-copy"><small>Disponíveis</small><strong>{stats.available}</strong><em>prontos para oferta</em></span>
          <Icon name="chevron" size={20}/>
        </button>
        <button type="button" className={filter === 'route' ? 'active' : ''} onClick={() => setFilter('route')}>
          <span className="ce2-stat-icon amber"><Icon name="truck" size={22}/></span>
          <span className="ce2-stat-copy"><small>Em rota</small><strong>{stats.routes}</strong><em>com corrida ativa</em></span>
          <Icon name="chevron" size={20}/>
        </button>
        <button
          type="button"
          className="ce2-pending-stat"
          onClick={() => document.getElementById('solicitacoes-entregadores')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          title="Ver solicitações pendentes"
        >
          <span className="ce2-stat-icon pending"><Icon name="users" size={22}/></span>
          <span className="ce2-stat-copy"><small>Solicitações</small><strong>{requests.length}</strong><em>aguardando análise</em></span>
          <Icon name="chevron" size={20}/>
        </button>
      </section>

      <section className="ce2-requests" id="solicitacoes-entregadores">
        <div className="ce2-section-head">
          <div>
            <span className="ce2-eyebrow">REDE PARTICULAR DA LOJA</span>
            <h2>Solicitações de entrada</h2>
            <p>Entregadores podem encontrar sua loja no app e pedir para entrar na rede particular.</p>
          </div>
          <span className="ce2-count">{requests.length} pendente{requests.length === 1 ? '' : 's'}</span>
        </div>

        {reviewMessage ? <div className="ce2-message">{reviewMessage}</div> : null}

        {requests.length ? (
          <div className="ce2-request-list">
            {requests.map(request => {
              const busy = reviewingIds.has(request.courierId)
              return (
                <article key={request.courierId} className="ce2-request">
                  <span className="ce2-avatar request">
                    {request.avatarUrl ? <img src={request.avatarUrl} alt="" /> : request.fullName.slice(0,1).toUpperCase()}
                    <i className={request.isOnline ? 'online' : ''}/>
                  </span>
                  <div className="ce2-request-person">
                    <strong>{request.fullName}</strong>
                    <span>{vehicleLabel(request.vehicleType)} · ★ {request.rating.toFixed(1)} · {request.totalDeliveries} entregas</span>
                    <small>Solicitado em {requestedLabel(request.requestedAt)}</small>
                  </div>
                  <div className="ce2-request-contact">
                    <small>Contato</small>
                    {request.phone
                      ? <a href={`tel:${request.phone.replace(/\D/g,'')}`}>{request.phone}</a>
                      : <strong>Não informado</strong>}
                  </div>
                  <div className="ce2-request-actions">
                    <button
                      type="button"
                      className="reject"
                      disabled={busy}
                      aria-busy={busy && reviewingActions[request.courierId] === 'rejected'}
                      onClick={() => reviewRequest(request.courierId,'rejected')}
                    >
                      {busy && reviewingActions[request.courierId] === 'rejected' ? 'Recusando...' : 'Recusar'}
                    </button>
                    <button
                      type="button"
                      className="approve"
                      disabled={busy}
                      aria-busy={busy && reviewingActions[request.courierId] === 'connected'}
                      onClick={() => reviewRequest(request.courierId,'connected')}
                    >
                      <Icon name="check" size={16}/>
                      {busy && reviewingActions[request.courierId] === 'connected' ? 'Aprovando...' : 'Aprovar'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="ce2-empty-request"><Icon name="users" size={22}/> Nenhuma solicitação pendente.</div>
        )}
      </section>

      <section className="ce2-network">
        <div className="ce2-toolbar">
          <div className="ce2-toolbar-title">
            <strong>Sua rede</strong>
            <span>{shown.length} de {couriers.length} entregador{couriers.length === 1 ? '' : 'es'}</span>
          </div>
          <div className="ce2-toolbar-controls">
            <label className="ce2-search">
              <Icon name="search" size={16}/>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar entregador..." />
            </label>
            <div className="ce2-filters">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
              <button className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>Online</button>
              <button className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')}>Disponíveis</button>
              <button className={filter === 'route' ? 'active' : ''} onClick={() => setFilter('route')}>Em rota</button>
            </div>
          </div>
        </div>

        <div className="ce2-grid">
          {shown.length ? shown.map(courier => {
            const gps = gpsAge(courier.lastLocationAt, now)
            const delivery = courier.activeDelivery
            const distance = distanceKm(storeLatitude,storeLongitude,courier.currentLatitude,courier.currentLongitude)
            const status = delivery
              ? statusLabels[delivery.status] ?? 'Em rota'
              : courier.isOnline
                ? courier.isAvailable ? 'Disponível' : 'Online · ocupado'
                : 'Offline'
            const expanded = expandedCourierId === courier.id

            return (
              <article key={courier.id} className={`ce2-courier-card ${delivery ? 'route' : ''}`}>
                <div className="ce2-courier-top">
                  <div className="ce2-person">
                    <span className="ce2-avatar">
                      {courier.avatarUrl ? <img src={courier.avatarUrl} alt="" /> : courier.fullName.slice(0,1).toUpperCase()}
                      <i className={courier.isOnline ? 'online' : ''}/>
                    </span>
                    <div>
                      <strong>{courier.fullName}</strong>
                      <span>{vehicleLabel(courier.vehicleType)} · <b>★ {courier.rating.toFixed(1)}</b> · {courier.totalDeliveries} entregas</span>
                      <small>{connectedLabel(courier.connectedAt)}</small>
                    </div>
                  </div>

                  <div className="ce2-courier-actions">
                    <span className={`ce2-status ${delivery ? 'route' : courier.isOnline && courier.isAvailable ? 'available' : courier.isOnline ? 'online' : 'offline'}`}>{status}</span>
                    <button type="button" className="ce2-mini" onClick={() => setExpandedCourierId(expanded ? null : courier.id)}>
                      <Icon name="user" size={16}/> {expanded ? 'Fechar perfil' : 'Ver perfil'}
                    </button>
                    {courier.phone ? (
                      <>
                        <a className="ce2-mini call" href={`tel:${courier.phone.replace(/\D/g,'')}`}><Icon name="phone" size={16}/> Chamar</a>
                        <a className="ce2-mini" target="_blank" rel="noreferrer" href={`https://wa.me/55${courier.phone.replace(/\D/g,'').replace(/^55/,'')}`}><Icon name="chat" size={16}/> Mensagem</a>
                      </>
                    ) : (
                      <button className="ce2-mini" type="button" disabled><Icon name="phone" size={16}/> Sem telefone</button>
                    )}
                    <Link className="ce2-mini" href={`/mapa?courier=${courier.id}`}><Icon name="map" size={16}/> Ver no mapa</Link>
                  </div>
                </div>

                <div className="ce2-metrics">
                  <div><span><Icon name="box" size={16}/></span><small>Entregas</small><strong>{courier.totalDeliveries}</strong></div>
                  <div><span>☆</span><small>Avaliação</small><strong>{courier.rating.toFixed(1)}</strong></div>
                  <div><span><Icon name="route" size={16}/></span><small>Distância da loja</small><strong>{distance == null ? '—' : distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1).replace('.', ',') + ' km'}</strong></div>
                  <div><span><Icon name="pin" size={16}/></span><small>Localização</small><strong className={gps.stale ? 'stale' : ''}>{gps.label}</strong></div>
                </div>

                {expanded ? (
                  <div className="ce2-profile-strip">
                    <div><small>Telefone</small><strong>{courier.phone || 'Não informado'}</strong></div>
                    <div><small>Veículo</small><strong>{vehicleLabel(courier.vehicleType)}</strong></div>
                    <div><small>Status no app</small><strong>{courier.isOnline ? 'Online' : 'Offline'}</strong></div>
                    <div><small>Disponibilidade</small><strong>{courier.isAvailable ? 'Disponível' : 'Indisponível'}</strong></div>
                  </div>
                ) : null}

                {delivery ? (
                  <div className="ce2-active-route">
                    <div className="ce2-route-id">
                      <span><Icon name="box" size={16}/> CORRIDA ATIVA</span>
                      <strong>#{shortId(delivery.id)}</strong>
                    </div>
                    <div className="ce2-route-flow">
                      <span><Icon name="store" size={17}/>{storeName}</span>
                      <Icon name="arrow" size={18}/>
                      <span><Icon name="pin" size={17}/>{delivery.customerName?.trim() || 'Cliente'}</span>
                    </div>
                    <div className="ce2-route-summary">
                      <strong>{money(delivery.deliveryFee)}</strong>
                      <span>{delivery.estimatedMinutes ? `~${delivery.estimatedMinutes} min` : 'Tempo calculando'}</span>
                    </div>
                    <Link href={`/chat?delivery=${delivery.id}`} className="ce2-details"><Icon name="chat" size={16}/> Ver detalhes</Link>
                  </div>
                ) : (
                  <div className="ce2-no-route">
                    <Icon name="check" size={18}/>
                    <span>{courier.isOnline && courier.isAvailable ? 'Pronto para receber novas ofertas.' : 'Sem corrida ativa no momento.'}</span>
                    <Link href="/entregas/nova">Criar entrega</Link>
                  </div>
                )}
              </article>
            )
          }) : (
            <div className="ce2-empty"><Icon name="user" size={28}/><strong>Nenhum entregador neste filtro</strong><span>Os entregadores conectados à rede da loja aparecerão aqui.</span></div>
          )}
        </div>
      </section>


    </div>
  )
}
