'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  latitude: number | null
  longitude: number | null
  previewLatitude: number | null
  previewLongitude: number | null
  storeLatitude: number | null
  storeLongitude: number | null
  onSelect: (latitude:number,longitude:number) => void
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

function destinationMarkerElement() {
  const element = document.createElement('div')
  element.className = 'ce-maplibre-destination-marker'
  element.innerHTML = '<span><i></i></span>'
  return element
}

export function DeliveryLocationPicker({
  latitude,
  longitude,
  previewLatitude,
  previewLongitude,
  storeLatitude,
  storeLongitude,
  onSelect,
}: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const callbackRef = useRef(onSelect)
  const [ready,setReady] = useState(false)
  const [error,setError] = useState('')

  callbackRef.current = onSelect

  useEffect(() => {
    let cancelled = false

    void loadMapLibre()
      .then(maplibregl => {
        if (cancelled || !elementRef.current || mapRef.current) return

        const hasDestination = latitude != null && longitude != null
        const hasPreview = previewLatitude != null && previewLongitude != null
        const hasStore = storeLatitude != null && storeLongitude != null

        const center:[number,number] = hasDestination
          ? [longitude as number,latitude as number]
          : hasPreview
            ? [previewLongitude as number,previewLatitude as number]
            : hasStore
              ? [storeLongitude as number,storeLatitude as number]
              : [-43.1729,-22.9068]

        const map = new maplibregl.Map({
          container:elementRef.current,
          style:MAP_STYLE,
          center,
          zoom:hasDestination ? 17 : hasPreview ? 15.5 : hasStore ? 14 : 11,
          attributionControl:true,
        })

        map.addControl(new maplibregl.NavigationControl({
          showCompass:true,
          showZoom:true,
        }),'bottom-right')

        const placeMarker = (lat:number,lon:number,centerMap:boolean) => {
          if (!markerRef.current) {
            markerRef.current = new maplibregl.Marker({
              element:destinationMarkerElement(),
              draggable:true,
              anchor:'bottom',
            })
              .setLngLat([lon,lat])
              .addTo(map)

            markerRef.current.on('dragend',() => {
              const point = markerRef.current.getLngLat()
              callbackRef.current(Number(point.lat),Number(point.lng))
            })
          } else {
            markerRef.current.setLngLat([lon,lat])
          }

          if (centerMap) {
            map.easeTo({
              center:[lon,lat],
              zoom:17,
              duration:650,
            })
          }
        }

        if (hasDestination) {
          placeMarker(latitude as number,longitude as number,false)
        }

        map.on('click',(event:any) => {
          const lat = Number(event.lngLat.lat)
          const lon = Number(event.lngLat.lng)
          placeMarker(lat,lon,false)
          callbackRef.current(lat,lon)
        })

        map.on('load',() => {
          setReady(true)
          setError('')
          window.setTimeout(() => map.resize(),80)
        })

        map.on('error',(event:any) => {
          if (!map.loaded() && event?.error) {
            setError('Não foi possível carregar os dados do mapa.')
          }
        })

        mapRef.current = map
      })
      .catch(reason => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Mapa indisponível.')
        }
      })

    return () => {
      cancelled = true
      markerRef.current?.remove()
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  },[])

  useEffect(() => {
    const map = mapRef.current
    if (!map || latitude != null || longitude != null) return
    if (previewLatitude == null || previewLongitude == null) return

    map.easeTo({
      center:[previewLongitude,previewLatitude],
      zoom:15.5,
      duration:700,
    })
  },[previewLatitude,previewLongitude,latitude,longitude])

  useEffect(() => {
    const map = mapRef.current
    const maplibregl = (window as any).__ceMapLibre
    if (!map || !maplibregl || latitude == null || longitude == null) return

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        element:destinationMarkerElement(),
        draggable:true,
        anchor:'bottom',
      })
        .setLngLat([longitude,latitude])
        .addTo(map)

      markerRef.current.on('dragend',() => {
        const point = markerRef.current.getLngLat()
        callbackRef.current(Number(point.lat),Number(point.lng))
      })
    } else {
      markerRef.current.setLngLat([longitude,latitude])
    }

    map.easeTo({
      center:[longitude,latitude],
      zoom:17,
      duration:650,
    })
  },[latitude,longitude])

  return (
    <div className="delivery-location-picker">
      <div ref={elementRef} className="delivery-location-picker-map maplibre-map" />

      {!ready && !error ? (
        <div className="delivery-location-picker-loading">Carregando mapa ChamaEntrega...</div>
      ) : null}

      {error ? (
        <div className="delivery-location-picker-error">{error}</div>
      ) : null}

      <div className="delivery-location-picker-help">
        <strong>Clique no mapa para marcar o destino</strong>
        <span>Você também pode arrastar o marcador para ajustar o ponto exato.</span>
      </div>

      <div className="delivery-map-provider-badge">MapLibre · OpenFreeMap</div>
    </div>
  )
}
