'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icon'
import { dispatchRouteAction } from '@/app/(dashboard)/despacho/actions'

export type DispatchDelivery = {
  id: string
  orderCode: string
  status: string
  customerName: string
  deliveryAddress: string
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  deliveryFee: number
  deliveryDistanceKm: number | null
  estimatedMinutes: number | null
  itemCount: number
  readyAt: string | null
  publishedAt: string | null
  createdAt: string
}

export type DispatchCourier = {
  id: string
  fullName: string
  avatarUrl: string | null
  vehicleType: string
  isOnline: boolean
  isAvailable: boolean
  rating: number
  currentLatitude: number | null
  currentLongitude: number | null
  lastLocationAt: string | null
}

type Props = {
  storeName: string
  storeLatitude: number | null
  storeLongitude: number | null
  initialDeliveries: DispatchDelivery[]
  initialCouriers: DispatchCourier[]
}

const statusLabel: Record<string,string> = {
  draft: 'Rascunho',
  available: 'Buscando entregador',
  negotiating: 'Em negociação',
}

function rad(value:number) {
  return value * Math.PI / 180
}

function distanceKm(lat1:number,lon1:number,lat2:number,lon2:number) {
  const earth = 6371
  const dLat = rad(lat2-lat1)
  const dLon = rad(lon2-lon1)
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon/2) ** 2
  return earth * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)
}

function compactAddress(address:string) {
  const parts = address.split(',').map(part => part.trim()).filter(Boolean)
  return parts.length <= 2 ? address : parts.slice(0,2).join(', ')
}

function initialSelection(deliveries:DispatchDelivery[]) {
  if (deliveries.length <= 3) return deliveries.map(item => item.id)

  const sorted = [...deliveries].sort((a,b) => {
    const aTime = new Date(a.readyAt || a.createdAt).getTime()
    const bTime = new Date(b.readyAt || b.createdAt).getTime()
    return aTime-bTime
  })

  const chosen = [sorted[0]]
  while (chosen.length < 3) {
    const anchor = chosen[chosen.length-1]
    const remaining = sorted.filter(item => !chosen.some(selected => selected.id === item.id))
    if (!remaining.length) break

    let best = remaining[0]
    let bestDistance = Number.POSITIVE_INFINITY

    for (const candidate of remaining) {
      if (
        anchor.deliveryLatitude != null &&
        anchor.deliveryLongitude != null &&
        candidate.deliveryLatitude != null &&
        candidate.deliveryLongitude != null
      ) {
        const d = distanceKm(
          anchor.deliveryLatitude,
          anchor.deliveryLongitude,
          candidate.deliveryLatitude,
          candidate.deliveryLongitude,
        )
        if (d < bestDistance) {
          best = candidate
          bestDistance = d
        }
      } else if (candidate.deliveryDistanceKm != null && candidate.deliveryDistanceKm < bestDistance) {
        best = candidate
        bestDistance = candidate.deliveryDistanceKm
      }
    }

    chosen.push(best)
  }

  return chosen.map(item => item.id)
}

export function SmartDispatchBoard({
  storeName,
  storeLatitude,
  storeLongitude,
  initialDeliveries,
  initialCouriers,
}:Props) {
  const router = useRouter()
  const [selectedIds,setSelectedIds] = useState<string[]>(() => initialSelection(initialDeliveries))
  const [autoMode,setAutoMode] = useState(false)
  const [dispatchMessage,setDispatchMessage] = useState('')
  const [dispatchError,setDispatchError] = useState(false)
  const [isDispatching,startDispatch] = useTransition()

  const selected = useMemo(
    () => initialDeliveries.filter(item => selectedIds.includes(item.id)).slice(0,3),
    [initialDeliveries,selectedIds],
  )

  const availableCouriers = initialCouriers.filter(item => item.isOnline && item.isAvailable)

  const suggestedCourier = useMemo(() => {
    if (!availableCouriers.length) return null
    if (storeLatitude == null || storeLongitude == null) return availableCouriers[0]

    return [...availableCouriers].sort((a,b) => {
      const da = a.currentLatitude != null && a.currentLongitude != null
        ? distanceKm(storeLatitude,storeLongitude,a.currentLatitude,a.currentLongitude)
        : 99999
      const db = b.currentLatitude != null && b.currentLongitude != null
        ? distanceKm(storeLatitude,storeLongitude,b.currentLatitude,b.currentLongitude)
        : 99999
      return da-db
    })[0]
  },[availableCouriers,storeLatitude,storeLongitude])

  const totalFee = selected.reduce((sum,item) => sum+item.deliveryFee,0)
  const routeKm = selected.reduce((sum,item) => sum+(item.deliveryDistanceKm ?? 2.5),0)
  const routeMinutes = selected.length
    ? Math.max(12,Math.round(selected.reduce((sum,item) => sum+(item.estimatedMinutes ?? 12),0)*.72))
    : 0

  function toggle(id:string) {
    setSelectedIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id)
      if (current.length >= 3) return [...current.slice(1),id]
      return [...current,id]
    })
  }

  function dispatchSelectedRoute() {
    if (!suggestedCourier || !selected.length || isDispatching) return

    setDispatchMessage('')
    setDispatchError(false)

    startDispatch(async () => {
      const result = await dispatchRouteAction(
        selected.map(item => item.id),
        suggestedCourier.id,
      )

      setDispatchMessage(result.message)
      setDispatchError(!result.ok)

      if (result.ok) {
        router.refresh()
      }
    })
  }

  return (
    <div className="dispatch-page">
      <section className="dispatch-hero">
        <div>
          <div className="eyebrow">CENTRAL DE DESPACHO</div>
          <h1>Despacho <span>Inteligente</span></h1>
          <p>Agrupe até 3 entregas, priorize pedidos antigos e encontre o entregador disponível mais próximo.</p>
        </div>
        <div className="dispatch-hero-actions">
          <div className="dispatch-live"><i/> AO VIVO</div>
          <label className="dispatch-auto">
            <input type="checkbox" checked={autoMode} onChange={event => setAutoMode(event.target.checked)} />
            <span/> Modo automático
          </label>
        </div>
      </section>

      <section className="dispatch-metrics">
        <article><Icon name="box" size={20}/><div><small>Pedidos na fila</small><strong>{initialDeliveries.length}</strong><span>Aguardando despacho</span></div></article>
        <article><Icon name="route" size={20}/><div><small>Rota sugerida</small><strong>{selected.length}</strong><span>Máximo de 3 entregas</span></div></article>
        <article><Icon name="user" size={20}/><div><small>Disponíveis</small><strong>{availableCouriers.length}</strong><span>Entregadores online</span></div></article>
        <article><Icon name="money" size={20}/><div><small>Taxas da rota</small><strong>{money(totalFee)}</strong><span>{routeKm.toFixed(1).replace('.',',')} km estimados</span></div></article>
      </section>

      <section className="dispatch-workspace">
        <aside className="dispatch-queue">
          <div className="dispatch-panel-head">
            <div><small>FILA OPERACIONAL</small><h2>Pedidos prontos</h2></div>
            <button type="button" onClick={() => setSelectedIds(initialSelection(initialDeliveries))}>Recalcular</button>
          </div>

          <div className="dispatch-queue-list">
            {initialDeliveries.length ? initialDeliveries.map(item => {
              const active = selectedIds.includes(item.id)
              return (
                <button key={item.id} type="button" className={active ? 'dispatch-order active' : 'dispatch-order'} onClick={() => toggle(item.id)}>
                  <span className="dispatch-check">{active ? '✓' : ''}</span>
                  <span className="dispatch-order-copy">
                    <strong>#{item.orderCode} · {item.customerName}</strong>
                    <span>{compactAddress(item.deliveryAddress)}</span>
                    <small>{item.itemCount} {item.itemCount === 1 ? 'item' : 'itens'}</small>
                  </span>
                  <span className="dispatch-order-meta">
                    <b>{money(item.deliveryFee)}</b>
                    <em className={item.status}>{statusLabel[item.status] ?? item.status}</em>
                  </span>
                </button>
              )
            }) : (
              <div className="dispatch-empty">
                <Icon name="box" size={28}/>
                <strong>Nenhum pedido aguardando despacho</strong>
                <p>Quando uma entrega ficar pronta ela aparecerá automaticamente aqui.</p>
                <Link href="/entregas/nova">Criar uma entrega</Link>
              </div>
            )}
          </div>
        </aside>

        <main className="dispatch-map-card">
          <div className="dispatch-panel-head">
            <div><small>ROTA CALCULADA</small><h2>Mapa operacional</h2></div>
            <Link href="/mapa"><Icon name="map" size={14}/> Abrir mapa</Link>
          </div>

          <div className="dispatch-route-map">
            <div className="dispatch-map-grid"/>
            <svg viewBox="0 0 680 420" aria-hidden="true">
              <path className="dispatch-road" d="M40 310 C130 220 180 280 245 190 S390 95 455 165 S555 285 645 110"/>
              <path className="dispatch-road thin" d="M20 115 C125 150 175 100 260 145 S420 270 655 250"/>
              {selected.length ? <path className="dispatch-smart-route" d="M100 330 C185 285 270 275 340 220 S455 250 500 185 S565 125 610 92"/> : null}
            </svg>
            <div className="dispatch-store-pin"><Icon name="store" size={17}/><span>{storeName}</span></div>
            {selected.map((item,index) => (
              <div key={item.id} className={'dispatch-stop stop-'+(index+1)}>
                <b>{index+1}</b><span>{item.customerName}</span>
              </div>
            ))}
          </div>

          <div className="dispatch-route-stops">
            <div className="dispatch-route-row store">
              <span><Icon name="store" size={15}/></span>
              <div><small>INÍCIO</small><strong>{storeName}</strong></div>
              <em>Retirada</em>
            </div>
            {selected.map((item,index) => (
              <div className="dispatch-route-row" key={item.id}>
                <span>{index+1}</span>
                <div><small>PARADA {index+1}</small><strong>{item.customerName}</strong><p>{compactAddress(item.deliveryAddress)}</p></div>
                <em>{money(item.deliveryFee)}</em>
              </div>
            ))}
          </div>
        </main>

        <aside className="dispatch-suggestion">
          <div className="dispatch-panel-head">
            <div><small>ROTA INTELIGENTE</small><h2>Melhor combinação</h2></div>
            <span className="dispatch-score">OTIMIZADA</span>
          </div>

          <div className="dispatch-summary">
            <div><small>Entregas</small><strong>{selected.length}</strong></div>
            <div><small>Distância</small><strong>{routeKm.toFixed(1).replace('.',',')} km</strong></div>
            <div><small>Tempo</small><strong>{routeMinutes} min</strong></div>
            <div><small>Taxas</small><strong>{money(totalFee)}</strong></div>
          </div>

          <div className="dispatch-courier-recommendation">
            <small>ENTREGADOR RECOMENDADO</small>
            {suggestedCourier ? (
              <div className="dispatch-courier">
                <span>{suggestedCourier.avatarUrl ? <img src={suggestedCourier.avatarUrl} alt=""/> : suggestedCourier.fullName.slice(0,1)}</span>
                <div><strong>{suggestedCourier.fullName}</strong><small>{suggestedCourier.vehicleType} · ★ {suggestedCourier.rating.toFixed(1)}</small></div>
                <em>Disponível</em>
              </div>
            ) : <div className="dispatch-no-courier">Nenhum entregador disponível agora.</div>}
          </div>

          <div className="dispatch-insights">
            <div><Icon name="lightning" size={15}/><span><strong>Agrupamento de rota</strong>Combina até 3 entregas e mantém a taxa individual de cada pedido.</span></div>
            <div><Icon name="clock" size={15}/><span><strong>Prioridade por espera</strong>Os pedidos mais antigos entram primeiro na sugestão.</span></div>
            <div><Icon name="map" size={15}/><span><strong>Operação conectada</strong>Depois do aceite, acompanhe tudo pelo Mapa ao vivo.</span></div>
          </div>

          <div className="dispatch-actions">
            <button type="button" onClick={() => setSelectedIds(initialSelection(initialDeliveries))} disabled={!initialDeliveries.length || isDispatching}>
              <Icon name="route" size={15}/> OTIMIZAR ROTA
            </button>
            <button
              type="button"
              className="dispatch-send"
              onClick={dispatchSelectedRoute}
              disabled={!selected.length || !suggestedCourier || isDispatching}
            >
              <Icon name="lightning" size={15}/>
              {isDispatching
                ? 'ENVIANDO...'
                : selected.length > 1
                  ? `DESPACHAR ${selected.length} ENTREGAS`
                  : 'DESPACHAR ENTREGA'}
            </button>
            <Link href="/entregas">ABRIR ENTREGAS</Link>
          </div>

          {dispatchMessage ? (
            <div className={dispatchError ? 'dispatch-result error' : 'dispatch-result success'}>
              <i/>
              <span>{dispatchMessage}</span>
            </div>
          ) : null}

          {autoMode ? <div className="dispatch-auto-note"><i/><span><strong>Modo automático ativo</strong>A sugestão será recalculada conforme a fila mudar.</span></div> : null}
        </aside>
      </section>
    </div>
  )
}
