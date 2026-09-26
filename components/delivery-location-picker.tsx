'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  latitude: number | null
  longitude: number | null
  storeLatitude: number | null
  storeLongitude: number | null
  onSelect: (latitude:number,longitude:number) => void
}

let leafletPromise: Promise<any> | null = null

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapa indisponível.'))
  const w = window as any
  if (w.L) return Promise.resolve(w.L)
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise((resolve,reject) => {
    if (!document.querySelector('link[data-ce-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.setAttribute('data-ce-leaflet','true')
      document.head.appendChild(link)
    }

    const existing = document.querySelector('script[data-ce-leaflet]') as HTMLScriptElement | null
    if (existing) {
      if ((window as any).L) {
        resolve((window as any).L)
        return
      }
      existing.addEventListener('load',() => resolve((window as any).L),{ once:true })
      existing.addEventListener('error',() => reject(new Error('Não foi possível carregar o mapa.')),{ once:true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.defer = true
    script.setAttribute('data-ce-leaflet','true')
    script.onload = () => resolve((window as any).L)
    script.onerror = () => reject(new Error('Não foi possível carregar o mapa.'))
    document.head.appendChild(script)
  })

  return leafletPromise
}

export function DeliveryLocationPicker({
  latitude,
  longitude,
  storeLatitude,
  storeLongitude,
  onSelect,
}: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const callbackRef = useRef(onSelect)
  const [ready,setReady] = useState(false)
  const [error,setError] = useState('')

  callbackRef.current = onSelect

  useEffect(() => {
    let cancelled = false

    void loadLeaflet()
      .then(L => {
        if (cancelled || !elementRef.current || mapRef.current) return

        leafletRef.current = L

        const hasDestination = latitude != null && longitude != null
        const hasStore = storeLatitude != null && storeLongitude != null
        const center:[number,number] = hasDestination
          ? [latitude as number,longitude as number]
          : hasStore
            ? [storeLatitude as number,storeLongitude as number]
            : [-22.9068,-43.1729]

        const map = L.map(elementRef.current,{
          zoomControl:true,
          attributionControl:true,
        }).setView(center,hasDestination ? 17 : hasStore ? 14 : 11)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
          maxZoom:19,
          attribution:'&copy; OpenStreetMap',
        }).addTo(map)

        const destinationIcon = L.divIcon({
          className:'ce-delivery-picker-icon-wrap',
          html:'<span class="ce-delivery-picker-pin"><i></i></span>',
          iconSize:[38,46],
          iconAnchor:[19,43],
        })

        function placeMarker(lat:number,lon:number,centerMap:boolean) {
          if (!markerRef.current) {
            markerRef.current = L.marker([lat,lon],{
              icon:destinationIcon,
              draggable:true,
              zIndexOffset:1000,
            }).addTo(map)

            markerRef.current.on('dragend',(event:any) => {
              const point = event.target.getLatLng()
              callbackRef.current(Number(point.lat),Number(point.lng))
            })
          } else {
            markerRef.current.setLatLng([lat,lon])
          }

          if (centerMap) map.setView([lat,lon],17,{ animate:true })
        }

        if (hasDestination) {
          placeMarker(latitude as number,longitude as number,false)
        }

        map.on('click',(event:any) => {
          const lat = Number(event.latlng.lat)
          const lon = Number(event.latlng.lng)
          placeMarker(lat,lon,false)
          callbackRef.current(lat,lon)
        })

        mapRef.current = map
        setReady(true)
        window.setTimeout(() => map.invalidateSize(),100)
      })
      .catch(reason => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Mapa indisponível.')
        }
      })

    return () => {
      cancelled = true
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      leafletRef.current = null
    }
  },[])

  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map || latitude == null || longitude == null) return

    if (!markerRef.current) {
      const destinationIcon = L.divIcon({
        className:'ce-delivery-picker-icon-wrap',
        html:'<span class="ce-delivery-picker-pin"><i></i></span>',
        iconSize:[38,46],
        iconAnchor:[19,43],
      })
      markerRef.current = L.marker([latitude,longitude],{
        icon:destinationIcon,
        draggable:true,
        zIndexOffset:1000,
      }).addTo(map)
      markerRef.current.on('dragend',(event:any) => {
        const point = event.target.getLatLng()
        callbackRef.current(Number(point.lat),Number(point.lng))
      })
    } else {
      markerRef.current.setLatLng([latitude,longitude])
    }

    map.setView([latitude,longitude],17,{ animate:true })
  },[latitude,longitude])

  return (
    <div className="delivery-location-picker">
      <div ref={elementRef} className="delivery-location-picker-map" />
      {!ready && !error ? (
        <div className="delivery-location-picker-loading">Carregando mapa...</div>
      ) : null}
      {error ? (
        <div className="delivery-location-picker-error">{error}</div>
      ) : null}
      <div className="delivery-location-picker-help">
        <strong>Clique no mapa para marcar o destino</strong>
        <span>Você também pode arrastar o marcador para ajustar o ponto exato.</span>
      </div>
    </div>
  )
}
