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

type LiveRoutePoint = {
  id: string
  deliveryId: string
  courierId: string
  latitude: number
  longitude: number
  recordedAt: string
}

type Props = {
  storeId: string
  storeName: string
  storeLogoUrl: string | null
  storeLatitude: number | null
  storeLongitude: number | null
  initialCouriers: LiveCourier[]
  initialDeliveries: LiveDelivery[]
  initialDeliveryId?: string | null
  initialCourierId?: string | null
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

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const MAPLIBRE_VERSION = '6.11.2'

let mapLibrePromise: Promise<any> | null = null

function loadMapLibre() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapa indisponível.'))
  const w = window as any
  if (w.__ceMapLibre) return Promise.resolve(w.__ceMapLibre)
  if (mapLibrePromise) return mapLibrePromise

  mapLibrePromise = new Promise((resolve,reject) => {
    if (!document.querySelector('link[data-ce-maplibre]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`
      link.setAttribute('data-ce-maplibre','true')
      document.head.appendChild(link)
    }

    const onReady = () => {
      const library = (window as any).__ceMapLibre
      if (library) resolve(library)
      else reject(new Error('Não foi possível carregar o mapa.'))
    }

    window.addEventListener('ce-maplibre-ready',onReady,{ once:true })

    if (document.querySelector('script[data-ce-maplibre]')) return

    const script = document.createElement('script')
    script.type = 'module'
    script.setAttribute('data-ce-maplibre','true')
    script.textContent = `
      import * as maplibregl from 'https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs';
      window.__ceMapLibre = maplibregl;
      window.dispatchEvent(new Event('ce-maplibre-ready'));
    `
    script.onerror = () => reject(new Error('Não foi possível carregar o mapa.'))
    document.head.appendChild(script)
  })

  return mapLibrePromise
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

function storeMarkerHtml(storeName: string, storeLogoUrl: string | null) {
  const logo = storeLogoUrl
    ? `<img src="${escapeHtml(storeLogoUrl)}" alt="" referrerpolicy="no-referrer"/>`
    : `<span class="ce-store-marker-fallback">${escapeHtml(storeName.slice(0,1).toUpperCase())}</span>`

  return `<div class="ce-store-logo-marker"><span class="reference-profile-logo ce-map-store-profile">${logo}</span></div>`
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

function htmlMarkerElement(className:string,html:string) {
  const element = document.createElement('div')
  element.className = className
  element.innerHTML = html
  return element
}

function destinationMarkerElement() {
  const element = document.createElement('div')
  element.className = 'ce-live-destination-marker'
  element.innerHTML = '<span><i></i></span>'
  return element
}


export function LiveCourierMap({
  storeId,
  storeName,
  storeLogoUrl,
  storeLatitude,
  storeLongitude,
  initialCouriers,
  initialDeliveries,
  initialDeliveryId = null,
  initialCourierId = null,
}: Props) {
  const supabase = useMemo(() => createClient(), [])

  const mapCardRef = useRef<HTMLDivElement | null>(null)
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const mapLibreRef = useRef<any>(null)
  const courierMarkersRef = useRef<Map<string,any>>(new Map())
  const storeMarkerRef = useRef<any>(null)
  const routeLineRef = useRef<any>(null)
  const destinationMarkerRef = useRef<any>(null)
  const firstFitRef = useRef(false)

  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [couriers, setCouriers] = useState(initialCouriers)
  const [deliveries, setDeliveries] = useState(initialDeliveries)
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(() =>
    initialDeliveryId
      ? initialDeliveries.find(item => item.id === initialDeliveryId)?.assignedCourierId ??
        initialCourierId ??
        initialCouriers.find(item => item.isOnline)?.id ??
        initialCouriers[0]?.id ??
        null
      : initialCourierId ??
        initialDeliveries.find(item => item.assignedCourierId)?.assignedCourierId ??
        initialCouriers.find(item => item.isOnline)?.id ??
        initialCouriers[0]?.id ??
        null
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [liveState, setLiveState] = useState('CONECTANDO')
  const [now, setNow] = useState(Date.now())
  const [routePoints, setRoutePoints] = useState<LiveRoutePoint[]>([])

  const deliveryByCourier = useMemo(() => {
    const map = new Map<string,LiveDelivery>()

    // As entregas chegam ordenadas por updated_at DESC. Mantemos a primeira
    // entrega ativa de cada entregador (a mais recente) e não deixamos uma
    // corrida antiga sobrescrevê-la.
    deliveries.forEach(delivery => {
      if (
        delivery.assignedCourierId &&
        activeStatuses.has(delivery.status) &&
        !map.has(delivery.assignedCourierId)
      ) {
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

  useEffect(() => {
    if (!initialDeliveryId) return
    const delivery = deliveries.find(item => item.id === initialDeliveryId)
    if (delivery?.assignedCourierId) {
      setSelectedCourierId(delivery.assignedCourierId)
      setFilter('route')
    }
  }, [deliveries, initialDeliveryId])


  const stats = useMemo(() => ({
    connected: couriers.length,
    online: couriers.filter(item => item.isOnline).length,
    available: couriers.filter(item => item.isOnline && item.isAvailable).length,
    routes: couriers.filter(item => deliveryByCourier.has(item.id)).length,
  }), [couriers, deliveryByCourier])


  useEffect(() => {
    const deliveryId = selectedDelivery?.id
    setRoutePoints([])

    if (!deliveryId) return

    let cancelled = false

    const loadRoute = async () => {
      const { data, error } = await supabase
        .from('delivery_location_points')
        .select('id,delivery_id,courier_id,latitude,longitude,recorded_at')
        .eq('delivery_id', deliveryId)
        .order('recorded_at', { ascending: true })
        .limit(1500)

      if (cancelled || error) return

      setRoutePoints((data ?? []).map((item: any) => ({
        id: item.id,
        deliveryId: item.delivery_id,
        courierId: item.courier_id,
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        recordedAt: item.recorded_at,
      })))
    }

    void loadRoute()

    const channel = supabase
      .channel(`delivery-live-route-${deliveryId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_location_points',
          filter: `delivery_id=eq.${deliveryId}`,
        },
        payload => {
          const item = payload.new as any

          setRoutePoints(current => {
            if (current.some(point => point.id === item.id)) return current

            return [...current, {
              id: item.id,
              deliveryId: item.delivery_id,
              courierId: item.courier_id,
              latitude: Number(item.latitude),
              longitude: Number(item.longitude),
              recordedAt: item.recorded_at,
            }]
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [selectedDelivery?.id, supabase])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapLibreRef.current) return

    const map = mapRef.current
    const maplibregl = mapLibreRef.current

    destinationMarkerRef.current?.remove()
    destinationMarkerRef.current = null

    if (map.getLayer('ce-live-route-line')) map.removeLayer('ce-live-route-line')
    if (map.getSource('ce-live-route')) map.removeSource('ce-live-route')

    if (!selectedDelivery) return

    if (
      selectedDelivery.deliveryLatitude != null &&
      selectedDelivery.deliveryLongitude != null
    ) {
      destinationMarkerRef.current = new maplibregl.Marker({
        element:destinationMarkerElement(),
        anchor:'bottom',
      })
        .setLngLat([
          selectedDelivery.deliveryLongitude,
          selectedDelivery.deliveryLatitude,
        ])
        .setPopup(new maplibregl.Popup({ offset:24 }).setText('Destino'))
        .addTo(map)
    }

    if (routePoints.length >= 2) {
      const data = {
        type:'Feature',
        properties:{},
        geometry:{
          type:'LineString',
          coordinates:routePoints.map(point => [point.longitude,point.latitude]),
        },
      }

      map.addSource('ce-live-route',{
        type:'geojson',
        data,
      })

      map.addLayer({
        id:'ce-live-route-line',
        type:'line',
        source:'ce-live-route',
        paint:{
          'line-color':'#ffb800',
          'line-width':5,
          'line-opacity':.92,
        },
        layout:{
          'line-cap':'round',
          'line-join':'round',
        },
      })
    }

    return () => {
      destinationMarkerRef.current?.remove()
      destinationMarkerRef.current = null
      if (map.getLayer('ce-live-route-line')) map.removeLayer('ce-live-route-line')
      if (map.getSource('ce-live-route')) map.removeSource('ce-live-route')
    }
  }, [
    mapReady,
    routePoints,
    selectedDelivery?.id,
    selectedDelivery?.deliveryLatitude,
    selectedDelivery?.deliveryLongitude,
  ])

  const refreshNetwork = useCallback(async () => {
    const { data: networkRows } = await supabase
      .from('courier_store_networks')
      .select('courier_id')
      .eq('store_id', storeId)
      .eq('status', 'connected')

    const ids = (networkRows ?? []).map(item => item.courier_id)

    const { data: courierRows } = ids.length
      ? await supabase
          .from('couriers')
          .select('id,vehicle_type,is_online,is_available,rating,total_deliveries,current_latitude,current_longitude,last_location_at')
          .in('id', ids)
          .order('is_online', { ascending: false })
      : { data: [] as any[] }

    const rows = courierRows ?? []
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
    if (!mapRef.current || !mapLibreRef.current) return

    const maplibregl = mapLibreRef.current
    const points = couriers
      .filter(item => item.currentLatitude != null && item.currentLongitude != null)
      .map(item => [item.currentLongitude!,item.currentLatitude!] as [number,number])

    if (storeLatitude != null && storeLongitude != null) {
      points.push([storeLongitude,storeLatitude])
    }

    if (!points.length) {
      mapRef.current.easeTo({ center:[-43.1729,-22.9068],zoom:11,duration:500 })
    } else if (points.length === 1) {
      mapRef.current.easeTo({ center:points[0],zoom:15,duration:500 })
    } else {
      const bounds = new maplibregl.LngLatBounds()
      points.forEach(point => bounds.extend(point))
      mapRef.current.fitBounds(bounds,{ padding:50,maxZoom:15,duration:650 })
    }
  }, [couriers, storeLatitude, storeLongitude])

  const toggleFullscreen = useCallback(async () => {
    const element = mapCardRef.current
    if (!element) return

    try {
      if (!document.fullscreenElement) {
        await element.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      // O navegador pode bloquear fullscreen fora de uma ação direta do usuário.
    }
  }, [])

  const focusCourier = useCallback((courier: LiveCourier) => {
    setSelectedCourierId(courier.id)
    if (
      courier.currentLatitude != null &&
      courier.currentLongitude != null &&
      mapRef.current
    ) {
      mapRef.current.flyTo({
        center:[courier.currentLongitude,courier.currentLatitude],
        zoom:16,
        duration:700,
      })
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    void loadMapLibre()
      .then(maplibregl => {
        if (cancelled || !mapElementRef.current || mapRef.current) return

        mapLibreRef.current = maplibregl

        const center:[number,number] =
          storeLatitude != null && storeLongitude != null
            ? [storeLongitude,storeLatitude]
            : [-43.1729,-22.9068]

        const map = new maplibregl.Map({
          container:mapElementRef.current,
          style:MAP_STYLE,
          center,
          zoom:12,
          attributionControl:true,
        })

        map.addControl(new maplibregl.NavigationControl({
          showCompass:true,
          showZoom:true,
        }),'bottom-right')

        map.on('load',() => {
          if (storeLatitude != null && storeLongitude != null) {
            const storeElement = htmlMarkerElement(
              'ce-maplibre-store-marker',
              storeMarkerHtml(storeName,storeLogoUrl),
            )

            storeMarkerRef.current = new maplibregl.Marker({
              element:storeElement,
              anchor:'center',
            })
              .setLngLat([storeLongitude,storeLatitude])
              .setPopup(new maplibregl.Popup({ offset:28 }).setText(storeName))
              .addTo(map)
          }

          setMapReady(true)
          setMapError('')
          window.setTimeout(() => map.resize(),80)
        })

        map.on('error',(event:any) => {
          if (!map.loaded() && event?.error) {
            setMapError('Não foi possível carregar o mapa agora.')
          }
        })

        mapRef.current = map
      })
      .catch(() => {
        if (!cancelled) setMapError('Não foi possível carregar o mapa agora.')
      })

    return () => {
      cancelled = true
      courierMarkersRef.current.forEach(marker => marker.remove())
      courierMarkersRef.current.clear()
      storeMarkerRef.current?.remove()
      storeMarkerRef.current = null
      destinationMarkerRef.current?.remove()
      destinationMarkerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      mapLibreRef.current = null
    }
  }, [storeLatitude, storeLongitude, storeName, storeLogoUrl])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === mapCardRef.current)

      window.setTimeout(() => {
        mapRef.current?.resize()
      },120)
    }

    document.addEventListener('fullscreenchange',onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange',onFullscreenChange)
  }, [])

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

    const poll = window.setInterval(() => void refreshNetwork(),30000)

    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(courierChannel)
      void supabase.removeChannel(deliveryChannel)
    }
  }, [refreshNetwork, storeId, supabase])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapLibreRef.current) return

    const map = mapRef.current
    const maplibregl = mapLibreRef.current
    const activeIds = new Set<string>()

    couriers.forEach(courier => {
      if (courier.currentLatitude == null || courier.currentLongitude == null) return

      activeIds.add(courier.id)
      const selected = courier.id === selectedCourierId
      const inRoute = deliveryByCourier.has(courier.id)
      const html = avatarMarkerHtml(courier,selected,inRoute)
      const existing = courierMarkersRef.current.get(courier.id)

      if (existing) {
        existing.setLngLat([courier.currentLongitude,courier.currentLatitude])
        existing.getElement().innerHTML = html
      } else {
        const element = htmlMarkerElement('ce-maplibre-courier-marker',html)
        element.addEventListener('click',() => setSelectedCourierId(courier.id))

        const marker = new maplibregl.Marker({
          element,
          anchor:'center',
        })
          .setLngLat([courier.currentLongitude,courier.currentLatitude])
          .addTo(map)

        courierMarkersRef.current.set(courier.id,marker)
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
      window.setTimeout(() => fitVisible(),120)
    }
  }, [couriers,deliveryByCourier,fitVisible,mapReady,selectedCourierId])

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
        <div ref={mapCardRef} className="live-map-card">
          <div className="live-map-toolbar">
            <div>
              <strong>Mapa operacional</strong>
              <span>MapLibre · OpenFreeMap · atualização automática</span>
            </div>
            <div className="live-map-toolbar-actions">
              <button type="button" onClick={fitVisible}><Icon name="map" size={16}/> Enquadrar todos</button>
              <button type="button" onClick={toggleFullscreen} className="map-fullscreen-button">
                <span className="map-fullscreen-icon" aria-hidden="true">{isFullscreen ? '↙' : '⛶'}</span>
                {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              </button>
            </div>
          </div>

          <div className="live-map-stage">
            <div ref={mapElementRef} className="live-map-canvas live-fallback-map" />

            {!mapReady && !mapError ? <div className="live-map-loading">Carregando mapa...</div> : null}
            {mapError ? <div className="live-map-error">{mapError}</div> : null}

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
                  {selectedDelivery ? (
                    <span className="map-tracking-status">
                      <i />
                      {routePoints.length > 1
                        ? `Rastreando ao vivo · ${routePoints.length} pontos`
                        : 'Aguardando próximo ponto do GPS'}
                    </span>
                  ) : null}
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
              const gps = gpsAge(courier.lastLocationAt,now)
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
