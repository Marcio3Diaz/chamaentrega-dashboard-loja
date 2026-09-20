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
type MapProvider = 'loading' | 'google' | 'fallback'

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

let googleMapsPromise: Promise<any> | null = null
let leafletPromise: Promise<any> | null = null

function loadGoogleMaps(apiKey: string, onAuthFailure: () => void) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps indisponível.'))
  const w = window as any
  w.gm_authFailure = onAuthFailure

  if (w.google?.maps) return Promise.resolve(w.google)
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__chamaEntregaGoogleMapsReady'
    w[callbackName] = () => {
      resolve(w.google)
      try { delete w[callbackName] } catch {}
    }

    const script = document.createElement('script')
    script.src =
      'https://maps.googleapis.com/maps/api/js?' +
      new URLSearchParams({
        key: apiKey,
        v: 'weekly',
        loading: 'async',
        callback: callbackName,
        language: 'pt-BR',
        region: 'BR',
      }).toString()
    script.async = true
    script.defer = true
    script.setAttribute('data-ce-google-maps', 'true')
    script.onerror = () => reject(new Error('Google Maps não carregou.'))
    document.head.appendChild(script)
  })

  return googleMapsPromise
}

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapa indisponível.'))
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

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.defer = true
    script.setAttribute('data-ce-leaflet', 'true')
    script.onload = () => resolve((window as any).L)
    script.onerror = () => reject(new Error('Mapa alternativo não carregou.'))
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char] ?? char))
}

function avatarMarkerHtml(courier: LiveCourier, selected: boolean, inRoute: boolean) {
  const classes = [
    'ce-fallback-courier-marker',
    selected ? 'selected' : '',
    inRoute ? 'route' : '',
    courier.isOnline && courier.isAvailable ? 'available' : '',
    !courier.isOnline ? 'offline' : '',
  ].filter(Boolean).join(' ')

  const avatar = courier.avatarUrl
    ? `<img src="${escapeHtml(courier.avatarUrl)}" alt="" referrerpolicy="no-referrer"/>`
    : '<span class="ce-fallback-avatar">👤</span>'

  return `<div class="${classes}"><span class="ce-fallback-avatar-ring">${avatar}<i></i></span></div>`
}

function buildGoogleAvatarOverlay(
  google: any,
  map: any,
  courier: LiveCourier,
  selected: boolean,
  inRoute: boolean,
  onClick: () => void,
) {
  class CourierOverlay extends google.maps.OverlayView {
    position: any
    courier: LiveCourier
    selected: boolean
    inRoute: boolean
    div: HTMLButtonElement | null = null

    constructor() {
      super()
      this.position = new google.maps.LatLng(courier.currentLatitude, courier.currentLongitude)
      this.courier = courier
      this.selected = selected
      this.inRoute = inRoute
    }

    onAdd() {
      const div = document.createElement('button')
      div.type = 'button'
      div.className = 'ce-google-courier-marker'
      div.title = this.courier.fullName
      div.onclick = event => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }
      this.div = div
      this.render()
      this.getPanes()?.overlayMouseTarget.appendChild(div)
    }

    draw() {
      if (!this.div) return
      const point = this.getProjection().fromLatLngToDivPixel(this.position)
      if (!point) return
      this.div.style.left = `${point.x}px`
      this.div.style.top = `${point.y}px`
    }

    onRemove() {
      this.div?.remove()
      this.div = null
    }

    render() {
      if (!this.div) return
      const available = this.courier.isOnline && this.courier.isAvailable
      this.div.className = [
        'ce-google-courier-marker',
        this.selected ? 'selected' : '',
        this.inRoute ? 'route' : '',
        available ? 'available' : '',
        !this.courier.isOnline ? 'offline' : '',
      ].filter(Boolean).join(' ')

      this.div.innerHTML = ''
      const ring = document.createElement('span')
      ring.className = 'ce-google-avatar-ring'

      if (this.courier.avatarUrl) {
        const img = document.createElement('img')
        img.src = this.courier.avatarUrl
        img.alt = this.courier.fullName
        img.referrerPolicy = 'no-referrer'
        ring.appendChild(img)
      } else {
        const fallback = document.createElement('span')
        fallback.className = 'ce-google-avatar-fallback'
        fallback.textContent = '👤'
        ring.appendChild(fallback)
      }

      const dot = document.createElement('i')
      dot.className = 'ce-google-marker-dot'
      ring.appendChild(dot)
      this.div.appendChild(ring)
    }

    update(next: LiveCourier, nextSelected: boolean, nextRoute: boolean) {
      this.courier = next
      this.selected = nextSelected
      this.inRoute = nextRoute
      this.position = new google.maps.LatLng(next.currentLatitude, next.currentLongitude)
      this.render()
      this.draw()
    }
  }

  const overlay = new CourierOverlay()
  overlay.setMap(map)
  return overlay
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

  const googleElementRef = useRef<HTMLDivElement | null>(null)
  const fallbackElementRef = useRef<HTMLDivElement | null>(null)
  const googleMapRef = useRef<any>(null)
  const fallbackMapRef = useRef<any>(null)
  const googleRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const googleMarkersRef = useRef<Map<string,any>>(new Map())
  const fallbackMarkersRef = useRef<Map<string,any>>(new Map())
  const firstFitRef = useRef(false)
  const fallbackStartingRef = useRef(false)

  const [provider, setProvider] = useState<MapProvider>('loading')
  const [mapMessage, setMapMessage] = useState('')
  const [couriers, setCouriers] = useState(initialCouriers)
  const [deliveries, setDeliveries] = useState(initialDeliveries)
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(
    initialDeliveries.find(item => item.assignedCourierId)?.assignedCourierId ??
    initialCouriers.find(item => item.isOnline)?.id ??
    initialCouriers[0]?.id ??
    null
  )
  const [filter, setFilter] = useState<Filter>('all')
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

  const startFallback = useCallback(async (message = '') => {
    if (fallbackStartingRef.current || fallbackMapRef.current) {
      setProvider('fallback')
      if (message) setMapMessage(message)
      return
    }

    fallbackStartingRef.current = true
    setMapMessage(message || 'Modo alternativo ativado automaticamente.')

    try {
      const L = await loadLeaflet()
      leafletRef.current = L
      if (!fallbackElementRef.current) return

      const center: [number,number] =
        storeLatitude != null && storeLongitude != null
          ? [storeLatitude, storeLongitude]
          : [-22.9068, -43.1729]

      const map = L.map(fallbackElementRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView(center, 12)

      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      fallbackMapRef.current = map
      setProvider('fallback')
      setTimeout(() => map.invalidateSize(), 80)
    } catch {
      setMapMessage('Não foi possível carregar nenhum provedor de mapa.')
    } finally {
      fallbackStartingRef.current = false
    }
  }, [storeLatitude, storeLongitude])

  const fitVisible = useCallback(() => {
    const points = couriers
      .filter(item => item.currentLatitude != null && item.currentLongitude != null)
      .map(item => [item.currentLatitude!, item.currentLongitude!] as [number,number])

    if (provider === 'google' && googleMapRef.current && googleRef.current) {
      const google = googleRef.current
      const bounds = new google.maps.LatLngBounds()
      points.forEach(([lat,lng]) => bounds.extend({ lat, lng }))
      if (storeLatitude != null && storeLongitude != null) bounds.extend({ lat: storeLatitude, lng: storeLongitude })
      if (!points.length && (storeLatitude == null || storeLongitude == null)) {
        googleMapRef.current.setCenter({ lat: -22.9068, lng: -43.1729 })
        googleMapRef.current.setZoom(11)
      } else {
        googleMapRef.current.fitBounds(bounds, 70)
      }
      return
    }

    if (provider === 'fallback' && fallbackMapRef.current && leafletRef.current) {
      const L = leafletRef.current
      if (storeLatitude != null && storeLongitude != null) points.push([storeLatitude,storeLongitude])
      if (!points.length) {
        fallbackMapRef.current.setView([-22.9068,-43.1729],11)
      } else if (points.length === 1) {
        fallbackMapRef.current.setView(points[0],15)
      } else {
        fallbackMapRef.current.fitBounds(L.latLngBounds(points), { padding:[50,50], maxZoom:15 })
      }
    }
  }, [couriers, provider, storeLatitude, storeLongitude])

  const focusCourier = useCallback((courier: LiveCourier) => {
    setSelectedCourierId(courier.id)
    if (courier.currentLatitude == null || courier.currentLongitude == null) return

    if (provider === 'google' && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: courier.currentLatitude, lng: courier.currentLongitude })
      googleMapRef.current.setZoom(16)
    } else if (provider === 'fallback' && fallbackMapRef.current) {
      fallbackMapRef.current.flyTo([courier.currentLatitude,courier.currentLongitude],16,{ duration:.7 })
    }
  }, [provider])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!apiKey) {
      void startFallback('Google Maps sem chave válida. Mapa alternativo ativado automaticamente.')
      return
    }

    loadGoogleMaps(apiKey, () => {
      if (!cancelled) void startFallback('Google Maps recusou a chave. Mapa alternativo ativado automaticamente.')
    })
      .then(google => {
        if (cancelled || !googleElementRef.current || googleMapRef.current || fallbackMapRef.current) return

        googleRef.current = google
        const center =
          storeLatitude != null && storeLongitude != null
            ? { lat: storeLatitude, lng: storeLongitude }
            : { lat: -22.9068, lng: -43.1729 }

        googleMapRef.current = new google.maps.Map(googleElementRef.current, {
          center,
          zoom: 12,
          mapTypeId: 'roadmap',
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        })

        setProvider('google')
        setMapMessage('')
      })
      .catch(() => {
        if (!cancelled) void startFallback('Google Maps não carregou. Mapa alternativo ativado automaticamente.')
      })

    return () => {
      cancelled = true
    }
  }, [apiKey, startFallback, storeLatitude, storeLongitude])

  useEffect(() => {
    const courierChannel = supabase
      .channel(`store-live-couriers-${storeId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couriers' }, payload => {
        const row = payload.new as any
        setCouriers(current => current.map(item => item.id !== row.id ? item : {
          ...item,
          vehicleType: row.vehicle_type ?? item.vehicleType,
          isOnline: Boolean(row.is_online),
          isAvailable: Boolean(row.is_available),
          rating: Number(row.rating ?? item.rating),
          totalDeliveries: Number(row.total_deliveries ?? item.totalDeliveries),
          currentLatitude: row.current_latitude == null ? null : Number(row.current_latitude),
          currentLongitude: row.current_longitude == null ? null : Number(row.current_longitude),
          lastLocationAt: row.last_location_at ?? item.lastLocationAt,
        }))
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setLiveState('AO VIVO')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveState('RECONECTANDO')
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
    if (provider !== 'google' || !googleMapRef.current || !googleRef.current) return
    const activeIds = new Set<string>()

    couriers.forEach(courier => {
      if (courier.currentLatitude == null || courier.currentLongitude == null) return
      activeIds.add(courier.id)
      const existing = googleMarkersRef.current.get(courier.id)
      const selected = courier.id === selectedCourierId
      const inRoute = deliveryByCourier.has(courier.id)

      if (existing) existing.update(courier,selected,inRoute)
      else {
        googleMarkersRef.current.set(
          courier.id,
          buildGoogleAvatarOverlay(
            googleRef.current,
            googleMapRef.current,
            courier,
            selected,
            inRoute,
            () => setSelectedCourierId(courier.id),
          ),
        )
      }
    })

    googleMarkersRef.current.forEach((marker,id) => {
      if (!activeIds.has(id)) {
        marker.setMap(null)
        googleMarkersRef.current.delete(id)
      }
    })

    if (!firstFitRef.current) {
      firstFitRef.current = true
      setTimeout(() => fitVisible(),120)
    }
  }, [couriers,deliveryByCourier,fitVisible,provider,selectedCourierId])

  useEffect(() => {
    if (provider !== 'fallback' || !fallbackMapRef.current || !leafletRef.current) return
    const L = leafletRef.current
    const activeIds = new Set<string>()

    couriers.forEach(courier => {
      if (courier.currentLatitude == null || courier.currentLongitude == null) return
      activeIds.add(courier.id)
      const selected = courier.id === selectedCourierId
      const inRoute = deliveryByCourier.has(courier.id)
      const icon = L.divIcon({
        className:'ce-fallback-marker-wrap',
        html:avatarMarkerHtml(courier,selected,inRoute),
        iconSize:[58,58],
        iconAnchor:[29,29],
      })

      const existing = fallbackMarkersRef.current.get(courier.id)
      if (existing) {
        existing.setLatLng([courier.currentLatitude,courier.currentLongitude])
        existing.setIcon(icon)
      } else {
        const marker = L.marker([courier.currentLatitude,courier.currentLongitude],{ icon }).addTo(fallbackMapRef.current)
        marker.on('click',() => setSelectedCourierId(courier.id))
        fallbackMarkersRef.current.set(courier.id,marker)
      }
    })

    fallbackMarkersRef.current.forEach((marker,id) => {
      if (!activeIds.has(id)) {
        marker.remove()
        fallbackMarkersRef.current.delete(id)
      }
    })

    if (!firstFitRef.current) {
      firstFitRef.current = true
      setTimeout(() => fitVisible(),120)
    }
  }, [couriers,deliveryByCourier,fitVisible,provider,selectedCourierId])

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
          <button type="button" className="outline-link" onClick={() => void refreshNetwork()}>Atualizar</button>
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
              <span>{provider === 'google' ? 'Google Maps' : provider === 'fallback' ? 'Mapa alternativo' : 'Carregando mapa'} · atualização automática</span>
            </div>
            <button type="button" onClick={fitVisible}><Icon name="map" size={16}/> Enquadrar todos</button>
          </div>

          <div className="live-map-stage">
            <div
              ref={googleElementRef}
              className={`live-map-canvas live-google-map ${provider === 'fallback' ? 'provider-hidden' : ''}`}
            />
            <div
              ref={fallbackElementRef}
              className={`live-map-canvas live-fallback-map ${provider !== 'fallback' ? 'provider-hidden' : ''}`}
            />

            {provider === 'loading' ? <div className="live-map-loading">Carregando mapa...</div> : null}

            {provider === 'fallback' && mapMessage ? (
              <div className="live-map-provider-note">{mapMessage}</div>
            ) : null}

            {selectedCourier ? (
              <div className="map-selected-card">
                <div className="map-selected-avatar">
                  {selectedCourier.avatarUrl ? <img src={selectedCourier.avatarUrl} alt="" /> : <span>👤</span>}
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
            <div><h2>Entregadores</h2><p>{filteredCouriers.length} exibido{filteredCouriers.length === 1 ? '' : 's'}</p></div>
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
                    {courier.avatarUrl ? <img src={courier.avatarUrl} alt="" /> : <span>👤</span>}
                    <i className={courier.isOnline ? 'online' : ''} />
                  </span>
                  <span className="live-courier-info">
                    <strong>{courier.fullName}</strong>
                    <small>{vehicleLabel(courier.vehicleType)} · ★ {courier.rating.toFixed(1)}</small>
                    <span className={`gps-age ${gps.stale ? 'stale' : ''}`}>{gps.text}</span>
                    {delivery ? <span className="courier-route-label">{statusLabels[delivery.status] ?? delivery.status}</span> : null}
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
