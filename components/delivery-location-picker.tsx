'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/lib/google-maps-client'

type Props = {
  latitude: number | null
  longitude: number | null
  previewLatitude: number | null
  previewLongitude: number | null
  storeLatitude: number | null
  storeLongitude: number | null
  onSelect: (latitude:number,longitude:number) => void
}

function destinationMarkerElement() {
  const element=document.createElement('div')
  element.className='ce-google-destination-marker'
  element.innerHTML='<span><i></i></span>'
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
  const elementRef=useRef<HTMLDivElement | null>(null)
  const mapRef=useRef<any>(null)
  const markerRef=useRef<any>(null)
  const callbackRef=useRef(onSelect)
  const [ready,setReady]=useState(false)
  const [error,setError]=useState('')

  callbackRef.current=onSelect

  useEffect(() => {
    let cancelled=false

    void loadGoogleMaps()
      .then(async maps => {
        if (cancelled || !elementRef.current || mapRef.current) return

        const { AdvancedMarkerElement }=await maps.importLibrary('marker')

        const hasDestination=latitude != null && longitude != null
        const hasPreview=previewLatitude != null && previewLongitude != null
        const hasStore=storeLatitude != null && storeLongitude != null

        const center=hasDestination
          ? { lat:latitude as number,lng:longitude as number }
          : hasPreview
            ? { lat:previewLatitude as number,lng:previewLongitude as number }
            : hasStore
              ? { lat:storeLatitude as number,lng:storeLongitude as number }
              : { lat:-22.9068,lng:-43.1729 }

        const map=new maps.Map(elementRef.current,{
          center,
          zoom:hasDestination ? 17 : hasPreview ? 16 : hasStore ? 14 : 11,
          mapId:process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
          gestureHandling:'greedy',
          streetViewControl:true,
          mapTypeControl:true,
          fullscreenControl:true,
          clickableIcons:true,
          controlSize:30,
        })

        const placeMarker=(lat:number,lng:number,centerMap:boolean) => {
          if (!markerRef.current) {
            markerRef.current=new AdvancedMarkerElement({
              map,
              position:{ lat,lng },
              content:destinationMarkerElement(),
              gmpDraggable:true,
              title:'Destino da entrega',
            })

            markerRef.current.addListener('dragend',(event:any) => {
              const position=event?.latLng ?? markerRef.current.position
              const pointLat=typeof position?.lat === 'function' ? position.lat() : position?.lat
              const pointLng=typeof position?.lng === 'function' ? position.lng() : position?.lng
              if (Number.isFinite(Number(pointLat)) && Number.isFinite(Number(pointLng))) {
                callbackRef.current(Number(pointLat),Number(pointLng))
              }
            })
          } else {
            markerRef.current.position={ lat,lng }
          }

          if (centerMap) {
            map.panTo({ lat,lng })
            map.setZoom(17)
          }
        }

        if (hasDestination) {
          placeMarker(latitude as number,longitude as number,false)
        }

        map.addListener('click',(event:any) => {
          const lat=Number(event.latLng?.lat())
          const lng=Number(event.latLng?.lng())
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          placeMarker(lat,lng,false)
          callbackRef.current(lat,lng)
        })

        mapRef.current=map
        setReady(true)
        setError('')
      })
      .catch(reason => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Google Maps indisponível.')
        }
      })

    return () => {
      cancelled=true
      if (markerRef.current) markerRef.current.map=null
      markerRef.current=null
      mapRef.current=null
    }
  },[])

  useEffect(() => {
    const map=mapRef.current
    if (!map || latitude != null || longitude != null) return
    if (previewLatitude == null || previewLongitude == null) return

    map.panTo({ lat:previewLatitude,lng:previewLongitude })
    map.setZoom(16)
  },[previewLatitude,previewLongitude,latitude,longitude])

  useEffect(() => {
    const map=mapRef.current
    if (!map || latitude == null || longitude == null) return

    void loadGoogleMaps().then(async maps => {
      const { AdvancedMarkerElement }=await maps.importLibrary('marker')

      if (!markerRef.current) {
        markerRef.current=new AdvancedMarkerElement({
          map,
          position:{ lat:latitude,lng:longitude },
          content:destinationMarkerElement(),
          gmpDraggable:true,
          title:'Destino da entrega',
        })

        markerRef.current.addListener('dragend',(event:any) => {
          const position=event?.latLng ?? markerRef.current.position
          const pointLat=typeof position?.lat === 'function' ? position.lat() : position?.lat
          const pointLng=typeof position?.lng === 'function' ? position.lng() : position?.lng
          if (Number.isFinite(Number(pointLat)) && Number.isFinite(Number(pointLng))) {
            callbackRef.current(Number(pointLat),Number(pointLng))
          }
        })
      } else {
        markerRef.current.position={ lat:latitude,lng:longitude }
      }

      map.panTo({ lat:latitude,lng:longitude })
      map.setZoom(17)
    })
  },[latitude,longitude])

  return (
    <div className="delivery-location-picker">
      <div ref={elementRef} className="delivery-location-picker-map google-map" />

      {!ready && !error ? (
        <div className="delivery-location-picker-loading">Carregando Google Maps...</div>
      ) : null}

      {error ? (
        <div className="delivery-location-picker-error">{error}</div>
      ) : null}

      <div className="delivery-location-picker-help">
        <strong>Clique no mapa para marcar o destino</strong>
        <span>Você também pode arrastar o marcador para ajustar o ponto exato.</span>
      </div>

      <div className="delivery-map-provider-badge">Google Maps</div>
    </div>
  )
}
