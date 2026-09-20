'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'

export type LiveCourier = {
  id: string
  fullName: string
  avatarUrl: string | null
  vehicleType: string | null
  isOnline: boolean
  isAvailable: boolean
  rating: number
  totalDeliveries: number
  currentLatitude: number | null
  currentLongitude: number | null
  lastLocationAt: string | null
}

export type LiveDelivery = {
  id: string
  assignedCourierId: string | null
  status: string
  pickupAddress: string
  pickupLatitude: number | null
  pickupLongitude: number | null
  deliveryAddress: string
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  customerName: string | null
  deliveryFee: number
  estimatedMinutes: number | null
}

type Props = {
  storeId: string
  storeName: string
  storeLatitude: number | null
  storeLongitude: number | null
  initialCouriers: LiveCourier[]
  initialDeliveries: LiveDelivery[]
}

type Filter = 'all' | 'online' | 'route'

const activeStatuses = new Set([
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
])

const statusLabels: Record<string,string> = {
  accepted: 'Aceita',
  heading_to_pickup: 'Indo retirar',
  at_pickup: 'Na loja',
  heading_to_dropoff: 'A caminho do cliente',
  at_dropoff: 'No cliente',
}

let leafletPromise: Promise<any> | null = null

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Leaflet indisponível'))
  const w = window as any
  if (w.L) return Promise.resolve(w.L)
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-ce-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.setAttribute('data-ce-leaflet', 'true')
      document.head.appendChild(link)
    }

    const existing = document.querySelector('script[data-ce-leaflet]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L), { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.defer = true
    script.setAttribute('data-ce-leaflet', 'true')
    script.onload = () => resolve((window as any).L)
    script.onerror = () => reject(new Error('Não foi possível carregar o mapa.'))
    document.head.appendChild(script)
  })

  return leafletPromise
}

function gpsAge(value: string | null, now: number) {
  if (!value) return { text: 'Sem localização', stale: true }
  const diff = Math.max(0, now - new Date(value).getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return { text: 'GPS agora', stale: false }
  if (minutes < 10) return { text: `GPS há ${minutes} min`, stale: false }
  if (minutes < 60) return { text: `GPS há ${minutes} min`, stale: true }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { text: `GPS há ${hours} h`, stale: true }
  return { text: `GPS há ${Math.floor(hours / 24)} dias`, stale: true }
}

function vehicleLabel(value: string | null) {
  if (value === 'bike') return 'Bicicleta'
  if (value === 'motorcycle') return 'Moto'
  if (value === 'car') return 'Carro'
  return 'Veículo'
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function LiveCourierMap({
  storeId,
  storeName,
  storeLatitude,
  storeLongitude,
  initialCouriers,
  initialDeliveries,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const courierMarkersRef = useRef<Map<string,any>>(new Map())
  const staticLayerRef = useRef<any>(null)
  const routeLayerRef = useRef<any>(null)
  const firstFitRef = useRef(false)

  const [couriers, setCouriers] = useState(initialCouriers)
  const [deliveries, setDeliveries] = useState(initialDeliveries)
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(
    initialDeliveries.find(item => item.assignedCourierId)?.assignedCourierId ??
    initialCouriers.find(item => item.isOnline)?.id ??
    initialCouriers[0]?.id ??
    null
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [liveState, setLiveState] = useState('CONECTANDO')
  const [now, setNow] = useState(Date.now())

  const deliveryByCourier = useMemo(() => {
    const map = new Map<string,LiveDelivery>()
    deliveries.forEach(delivery => {
      if (delivery.assignedCourierId && activeStatuses.has(delivery.status)) {
        map.set(delivery.assignedCourierId, delivery)
      }
    })
    return map
  }, [deliveries])

  const filteredCouriers = useMemo(() => {
    return couriers.filter(courier => {
      if (filter === 'online') return courier.isOnline
      if (filter === 'route') return deliveryByCourier.has(courier.id)
      return true
    })
  }, [couriers, filter, deliveryByCourier])

  const selectedCourier = couriers.find(item => item.id === selectedCourierId) ?? null
  const selectedDelivery = selectedCourier ? deliveryByCourier.get(selectedCourier.id) ?? null : null

  const stats = useMemo(() => ({
    connected: couriers.length,
    online: couriers.filter(item => item.isOnline).length,
    available: couriers.filter(item => item.isOnline && item.isAvailable).length,
    routes: couriers.filter(item => deliveryByCourier.has(item.id)).length,
  }), [couriers, deliveryByCourier])

  const refreshNetwork = useCallback(async () => {
    const { data: courierRows } = await supabase
      .from('couriers')
      .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
      .order('is_online', { ascending: false })

    const rows = courierRows ?? []
    const ids = rows.map(item => item.id)
    const { data: profileRows } = ids.length
      ? await supabase.from('profiles').select('id,full_name,avatar_url').in('id', ids)
      : { data: [] as any[] }

    const profiles = new Map((profileRows ?? []).map(item => [item.id, item]))

    setCouriers(rows.map((item: any) => ({
      id: item.id,
      fullName: profiles.get(item.id)?.full_name ?? 'Entregador parceiro',
      avatarUrl: profiles.get(item.id)?.avatar_url ?? null,
      vehicleType: item.vehicle_type,
      isOnline: Boolean(item.is_online),
      isAvailable: Boolean(item.is_available),
      rating: Number(item.rating ?? 0),
      totalDeliveries: Number(item.total_deliveries ?? 0),
      currentLatitude: item.current_latitude == null ? null : Number(item.current_latitude),
      currentLongitude: item.current_longitude == null ? null : Number(item.current_longitude),
      lastLocationAt: item.last_location_at,
    })))

    const { data: deliveryRows } = await supabase
      .from('deliveries')
      .select('id,assigned_courier_id,status,pickup_address,pickup_latitude,pickup_longitude,delivery_address,delivery_latitude,delivery_longitude,customer_name,delivery_fee,estimated_minutes')
      .eq('store_id', storeId)
      .in('status', Array.from(activeStatuses))
      .order('updated_at', { ascending: false })

    setDeliveries((deliveryRows ?? []).map((item: any) => ({
      id: item.id,
      assignedCourierId: item.assigned_courier_id,
      status: item.status,
      pickupAddress: item.pickup_address,
      pickupLatitude: item.pickup_latitude == null ? null : Number(item.pickup_latitude),
      pickupLongitude: item.pickup_longitude == null ? null : Number(item.pickup_longitude),
      deliveryAddress: item.delivery_address,
      deliveryLatitude: item.delivery_latitude == null ? null : Number(item.delivery_latitude),
      deliveryLongitude: item.delivery_longitude == null ? null : Number(item.delivery_longitude),
      customerName: item.customer_name,
      deliveryFee: Number(item.delivery_fee ?? 0),
      estimatedMinutes: item.estimated_minutes == null ? null : Number(item.estimated_minutes),
    })))
  }, [storeId, supabase])

  const fitVisible = useCallback(() => {
    const map = mapRef.current
    const L = LRef.current
    if (!map || !L) return

    const points: [number,number][] = []
    couriers.forEach(item => {
      if (item.currentLatitude != null && item.currentLongitude != null) {
        points.push([item.currentLatitude, item.currentLongitude])
      }
    })
    deliveries.forEach(item => {
      if (item.pickupLatitude != null && item.pickupLongitude != null) {
        points.push([item.pickupLatitude, item.pickupLongitude])
      }
      if (item.deliveryLatitude != null && item.deliveryLongitude != null) {
        points.push([item.deliveryLatitude, item.deliveryLongitude])
      }
    })
    if (storeLatitude != null && storeLongitude != null) points.push([storeLatitude, storeLongitude])

    if (!points.length) {
      map.setView([-22.9068, -43.1729], 11)
      return
    }
    if (points.length === 1) {
      map.setView(points[0], 15)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [55,55], maxZoom: 15 })
  }, [couriers, deliveries, storeLatitude, storeLongitude])

  const focusCourier = useCallback((courier: LiveCourier) => {
    setSelectedCourierId(courier.id)
    if (courier.currentLatitude != null && courier.currentLongitude != null && mapRef.current) {
      mapRef.current.flyTo([courier.currentLatitude, courier.currentLongitude], 16, { duration: .7 })
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then(L => {
        if (cancelled || !mapElementRef.current || mapRef.current) return
        LRef.current = L
        const center: [number,number] =
          storeLatitude != null && storeLongitude != null
            ? [storeLatitude, storeLongitude]
            : [-22.9068, -43.1729]

        const map = L.map(mapElementRef.current, {
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: true,
        }).setView(center, 12)

        L.control.zoom({ position: 'bottomright' }).addTo(map)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map)

        staticLayerRef.current = L.layerGroup().addTo(map)
        routeLayerRef.current = L.layerGroup().addTo(map)
        mapRef.current = map
        setMapReady(true)
        window.setTimeout(() => map.invalidateSize(), 80)
      })
      .catch(error => {
        if (!cancelled) setMapError(error instanceof Error ? error.message : 'Erro ao carregar o mapa.')
      })

    return () => {
      cancelled = true
      courierMarkersRef.current.forEach(marker => marker.remove())
      courierMarkersRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [storeLatitude, storeLongitude])

  useEffect(() => {
    const courierChannel = supabase
      .channel(`store-live-couriers-${storeId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couriers' }, payload => {
        const row = payload.new as any
        let found = false
        setCouriers(current => current.map(item => {
          if (item.id !== row.id) return item
          found = true
          return {
            ...item,
            vehicleType: row.vehicle_type ?? item.vehicleType,
            isOnline: Boolean(row.is_online),
            isAvailable: Boolean(row.is_available),
            rating: Number(row.rating ?? item.rating),
            totalDeliveries: Number(row.total_deliveries ?? item.totalDeliveries),
            currentLatitude: row.current_latitude == null ? null : Number(row.current_latitude),
            currentLongitude: row.current_longitude == null ? null : Number(row.current_longitude),
            lastLocationAt: row.last_location_at ?? item.lastLocationAt,
          }
        }))
        if (!found) void refreshNetwork()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setLiveState('AO VIVO')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveState('RECONectando'.toUpperCase())
      })

    const deliveryChannel = supabase
      .channel(`store-live-deliveries-${storeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deliveries',
        filter: `store_id=eq.${storeId}`,
      }, () => void refreshNetwork())
      .subscribe()

    const poll = window.setInterval(() => void refreshNetwork(), 30000)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(courierChannel)
      void supabase.removeChannel(deliveryChannel)
    }
  }, [refreshNetwork, storeId, supabase])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return
    const L = LRef.current
    const activeIds = new Set<string>()

    couriers.forEach(courier => {
      if (courier.currentLatitude == null || courier.currentLongitude == null) return
      activeIds.add(courier.id)

      const inRoute = deliveryByCourier.has(courier.id)
      const tone = !courier.isOnline ? 'offline' : inRoute ? 'route' : courier.isAvailable ? 'available' : 'busy'
      const initial = (courier.fullName.trim()[0] || 'E').toUpperCase()
      const icon = L.divIcon({
        className: 'ce-live-marker-wrap',
        html: `<div class="ce-live-marker ${tone}"><span>${initial}</span><i></i></div>`,
        iconSize: [52,52],
        iconAnchor: [26,26],
      })

      const existing = courierMarkersRef.current.get(courier.id)
      if (existing) {
        existing.setLatLng([courier.currentLatitude, courier.currentLongitude])
        existing.setIcon(icon)
      } else {
        const marker = L.marker([courier.currentLatitude, courier.currentLongitude], {
          icon,
          zIndexOffset: inRoute ? 400 : 200,
        }).addTo(mapRef.current)
        marker.on('click', () => setSelectedCourierId(courier.id))
        courierMarkersRef.current.set(courier.id, marker)
      }
    })

    courierMarkersRef.current.forEach((marker,id) => {
      if (!activeIds.has(id)) {
        marker.remove()
        courierMarkersRef.current.delete(id)
      }
    })

    if (!firstFitRef.current) {
      firstFitRef.current = true
      window.setTimeout(() => fitVisible(), 120)
    }
  }, [couriers, deliveryByCourier, fitVisible, mapReady])

  useEffect(() => {
    if (!mapReady || !routeLayerRef.current || !LRef.current) return
    const L = LRef.current
    routeLayerRef.current.clearLayers()

    if (storeLatitude != null && storeLongitude != null) {
      L.circleMarker([storeLatitude, storeLongitude], {
        radius: 8,
        color: '#ffb800',
        weight: 3,
        fillColor: '#111',
        fillOpacity: 1,
      }).bindTooltip(storeName, { direction: 'top' }).addTo(routeLayerRef.current)
    }

    if (!selectedCourier || !selectedDelivery) return

    const courierPoint =
      selectedCourier.currentLatitude != null && selectedCourier.currentLongitude != null
        ? [selectedCourier.currentLatitude, selectedCourier.currentLongitude] as [number,number]
        : null

    const pickupPoint =
      selectedDelivery.pickupLatitude != null && selectedDelivery.pickupLongitude != null
        ? [selectedDelivery.pickupLatitude, selectedDelivery.pickupLongitude] as [number,number]
        : null

    const dropoffPoint =
      selectedDelivery.deliveryLatitude != null && selectedDelivery.deliveryLongitude != null
        ? [selectedDelivery.deliveryLatitude, selectedDelivery.deliveryLongitude] as [number,number]
        : null

    if (pickupPoint) {
      L.circleMarker(pickupPoint, {
        radius: 7, color: '#33a8ff', weight: 3, fillColor: '#0b1117', fillOpacity: 1,
      }).bindTooltip('Retirada', { direction: 'top' }).addTo(routeLayerRef.current)
    }
    if (dropoffPoint) {
      L.circleMarker(dropoffPoint, {
        radius: 8, color: '#ffb800', weight: 3, fillColor: '#0b1117', fillOpacity: 1,
      }).bindTooltip('Cliente', { direction: 'top' }).addTo(routeLayerRef.current)
    }

    const goingPickup = ['accepted','heading_to_pickup'].includes(selectedDelivery.status)
    const target = goingPickup ? pickupPoint : dropoffPoint

    if (courierPoint && target) {
      L.polyline([courierPoint,target], {
        color: '#ffb800',
        weight: 4,
        opacity: .9,
        dashArray: '10 10',
      }).addTo(routeLayerRef.current)
    }
  }, [mapReady, selectedCourier, selectedDelivery, storeLatitude, storeLongitude, storeName])

  return (
    <div className="live-map-page">
      <section className="live-map-header">
        <div>
          <div className="eyebrow">RASTREAMENTO EM TEMPO REAL</div>
          <h1>Entregadores ao vivo</h1>
          <p>Acompanhe sua rede, corridas ativas e a última posição enviada pelo app do entregador.</p>
        </div>
        <div className="live-map-header-actions">
          <span className={`live-map-signal ${liveState === 'AO VIVO' ? 'online' : ''}`}><i />{liveState}</span>
          <button type="button" className="outline-link" onClick={() => void refreshNetwork()}>
            Atualizar
          </button>
        </div>
      </section>

      <section className="live-map-stats">
        <article><span>Rede conectada</span><strong>{stats.connected}</strong><small>entregadores</small></article>
        <article><span>Online agora</span><strong>{stats.online}</strong><small>conectados ao app</small></article>
        <article><span>Disponíveis</span><strong>{stats.available}</strong><small>prontos para oferta</small></article>
        <article><span>Em rota</span><strong>{stats.routes}</strong><small>corridas ativas</small></article>
      </section>

      <section className="live-map-layout">
        <div className="live-map-card">
          <div className="live-map-toolbar">
            <div>
              <strong>Mapa operacional</strong>
              <span>OpenStreetMap · atualização automática</span>
            </div>
            <button type="button" onClick={fitVisible}>
              <Icon name="map" size={16}/> Enquadrar todos
            </button>
          </div>

          <div className="live-map-stage">
            <div ref={mapElementRef} className="live-map-canvas" />
            {mapError ? <div className="live-map-error">{mapError}</div> : null}
            {!mapError && !mapReady ? <div className="live-map-loading">Carregando mapa...</div> : null}

            {selectedCourier ? (
              <div className="map-selected-card">
                <div className="map-selected-avatar">
                  {selectedCourier.avatarUrl
                    ? <img src={selectedCourier.avatarUrl} alt="" />
                    : selectedCourier.fullName.slice(0,1).toUpperCase()}
                </div>
                <div className="map-selected-copy">
                  <strong>{selectedCourier.fullName}</strong>
                  <span>
                    {selectedDelivery
                      ? statusLabels[selectedDelivery.status] ?? selectedDelivery.status
                      : selectedCourier.isOnline
                        ? selectedCourier.isAvailable ? 'Disponível' : 'Online'
                        : 'Offline'}
                  </span>
                </div>
                {selectedCourier.currentLatitude != null && selectedCourier.currentLongitude != null ? (
                  <button type="button" onClick={() => focusCourier(selectedCourier)}>Centralizar</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="live-courier-panel">
          <div className="live-courier-panel-head">
            <div>
              <h2>Entregadores</h2>
              <p>{filteredCouriers.length} exibido{filteredCouriers.length === 1 ? '' : 's'}</p>
            </div>
          </div>

          <div className="live-courier-filters">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
            <button className={filter === 'online' ? 'active' : ''} onClick={() => setFilter('online')}>Online</button>
            <button className={filter === 'route' ? 'active' : ''} onClick={() => setFilter('route')}>Em rota</button>
          </div>

          <div className="live-courier-list">
            {filteredCouriers.length ? filteredCouriers.map(courier => {
              const delivery = deliveryByCourier.get(courier.id)
              const gps = gpsAge(courier.lastLocationAt, now)
              const active = courier.id === selectedCourierId
              return (
                <button
                  type="button"
                  key={courier.id}
                  className={`live-courier-item ${active ? 'active' : ''}`}
                  onClick={() => focusCourier(courier)}
                >
                  <span className="live-courier-avatar">
                    {courier.avatarUrl
                      ? <img src={courier.avatarUrl} alt="" />
                      : courier.fullName.slice(0,1).toUpperCase()}
                    <i className={courier.isOnline ? 'online' : ''} />
                  </span>

                  <span className="live-courier-info">
                    <strong>{courier.fullName}</strong>
                    <small>{vehicleLabel(courier.vehicleType)} · ★ {courier.rating.toFixed(1)}</small>
                    <span className={`gps-age ${gps.stale ? 'stale' : ''}`}>{gps.text}</span>
                    {delivery ? (
                      <span className="courier-route-label">
                        {statusLabels[delivery.status] ?? delivery.status}
                      </span>
                    ) : null}
                  </span>

                  <span className="live-courier-chevron">›</span>
                </button>
              )
            }) : (
              <div className="live-courier-empty">
                <Icon name="pin" size={28}/>
                <strong>Nenhum entregador neste filtro</strong>
                <span>A rede conectada aparecerá aqui.</span>
              </div>
            )}
          </div>

          {selectedCourier && selectedDelivery ? (
            <div className="live-delivery-detail">
              <span className="eyebrow">CORRIDA ATIVA</span>
              <strong>#{selectedDelivery.id.replaceAll('-','').slice(0,7).toUpperCase()}</strong>
              <div><b>Retirada</b><span>{selectedDelivery.pickupAddress}</span></div>
              <div><b>Destino</b><span>{selectedDelivery.deliveryAddress}</span></div>
              <div className="live-delivery-meta">
                <span>{money(selectedDelivery.deliveryFee)}</span>
                <span>{selectedDelivery.estimatedMinutes ? `~${selectedDelivery.estimatedMinutes} min` : 'Tempo calculando'}</span>
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  )
}
