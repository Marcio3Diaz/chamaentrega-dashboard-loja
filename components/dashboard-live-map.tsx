'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'

type DeliveryPoint = {
  id: string
  status: string
  latitude: number | null
  longitude: number | null
}

type Props = {
  storeLatitude: number | null
  storeLongitude: number | null
  deliveries: DeliveryPoint[]
}

let leafletPromise: Promise<any> | null = null

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapa indisponível'))
  const w = window as any
  if (w.L) return Promise.resolve(w.L)
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise((resolve,reject) => {
    if (!document.querySelector('link[data-dashboard-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.setAttribute('data-dashboard-leaflet','true')
      document.head.appendChild(link)
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.defer = true
    script.setAttribute('data-dashboard-leaflet','true')
    script.onload = () => resolve((window as any).L)
    script.onerror = () => reject(new Error('Não foi possível carregar o mapa'))
    document.head.appendChild(script)
  })

  return leafletPromise
}

export function DashboardLiveMap({ storeLatitude, storeLongitude, deliveries }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const [error,setError] = useState('')
  const active = useMemo(() => deliveries.filter(item => item.latitude != null && item.longitude != null),[deliveries])

  useEffect(() => {
    let cancelled = false

    loadLeaflet().then(L => {
      if (cancelled || !ref.current || mapRef.current) return

      const center:[number,number] =
        storeLatitude != null && storeLongitude != null
          ? [storeLatitude,storeLongitude]
          : [-22.9068,-43.1729]

      const map = L.map(ref.current,{
        zoomControl:true,
        attributionControl:true,
        scrollWheelZoom:true,
      }).setView(center,12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,
        attribution:'&copy; OpenStreetMap contributors',
      }).addTo(map)

      if (storeLatitude != null && storeLongitude != null) {
        L.circleMarker([storeLatitude,storeLongitude],{
          radius:9,
          color:'#ffb800',
          weight:4,
          fillColor:'#ffb800',
          fillOpacity:.24,
        }).bindTooltip('Loja').addTo(map)
      }

      const bounds:any[] = []
      if (storeLatitude != null && storeLongitude != null) bounds.push([storeLatitude,storeLongitude])

      active.forEach((delivery,index) => {
        const point:[number,number] = [delivery.latitude!,delivery.longitude!]
        bounds.push(point)
        L.circleMarker(point,{
          radius:8,
          color:index % 2 === 0 ? '#2f9cff' : '#20d27a',
          weight:3,
          fillColor:'#10151a',
          fillOpacity:1,
        }).bindTooltip(`Entrega #${delivery.id.replaceAll('-','').slice(0,5).toUpperCase()}`).addTo(map)
      })

      if (bounds.length > 1) {
        map.fitBounds(bounds,{padding:[35,35],maxZoom:13})
      }

      mapRef.current = map
      setError('')
      window.setTimeout(() => map.invalidateSize(),100)
    }).catch(() => {
      if (!cancelled) setError('Mapa indisponível agora')
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  },[storeLatitude,storeLongitude,active])

  return (
    <div className="reference-map-stage">
      <div ref={ref} className="reference-map-canvas" />
      {error ? <div className="reference-map-error">{error}</div> : null}
      <div className="reference-map-badge"><i /> {deliveries.length} entrega{deliveries.length === 1 ? '' : 's'} ativa{deliveries.length === 1 ? '' : 's'}</div>
      <Link href="/mapa" className="reference-map-expand" aria-label="Abrir mapa completo" title="Abrir mapa completo"><Icon name="map" size={16}/></Link>
    </div>
  )
}
