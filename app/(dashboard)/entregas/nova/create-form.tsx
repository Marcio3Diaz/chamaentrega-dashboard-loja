'use client'

import { useActionState, useMemo, useState } from 'react'
import { createDeliveryAction, type CreateState } from './actions'

const initial: CreateState = {}

export type DeliveryOrderPrefill = {
  orderId: string
  externalOrderId: string | null
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryLatitude: string
  deliveryLongitude: string
  orderTotal: string
  paymentMethod: string
  customerNote: string
  itemCount: number
}

export type DeliveryPricingConfig = {
  enabled: boolean
  minimumFee: number
  includedKm: number
  perExtraKm: number
  roadFactor: number
  roundStep: number
}

function radians(value:number) {
  return value * Math.PI / 180
}

function haversineKm(lat1:number,lon1:number,lat2:number,lon2:number) {
  const earthRadiusKm = 6371
  const deltaLat = radians(lat2-lat1)
  const deltaLon = radians(lon2-lon1)
  const a =
    Math.sin(deltaLat/2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLon/2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  }).format(value)
}

export function CreateDeliveryForm({
  availableBalance,
  reservedBalance,
  initialOrder,
  storeLatitude,
  storeLongitude,
  storeCity,
  storeState,
  pricing,
}: {
  availableBalance: number
  reservedBalance: number
  initialOrder?: DeliveryOrderPrefill | null
  storeLatitude: number | null
  storeLongitude: number | null
  storeCity: string | null
  storeState: string | null
  pricing: DeliveryPricingConfig
}) {
  const [state, action, pending] = useActionState(createDeliveryAction, initial)
  const [fee, setFee] = useState('')
  const [address,setAddress] = useState(initialOrder?.deliveryAddress ?? '')
  const [latitude,setLatitude] = useState(initialOrder?.deliveryLatitude ?? '')
  const [longitude,setLongitude] = useState(initialOrder?.deliveryLongitude ?? '')
  const [deliveryDistance,setDeliveryDistance] = useState('')
  const [estimatedMinutes,setEstimatedMinutes] = useState('')
  const [resolvedAddress,setResolvedAddress] = useState('')
  const [geocodeError,setGeocodeError] = useState('')
  const [locating,setLocating] = useState(false)
  const [lastLocatedAddress,setLastLocatedAddress] = useState('')

  const feeValue = useMemo(() => {
    const value = Number(fee.replace(',', '.'))
    return Number.isFinite(value) ? value : 0
  }, [fee])

  const insufficient = feeValue > availableBalance
  const hasCoordinates = Boolean(latitude && longitude)

  const mapPreviewUrl = useMemo(() => {
    if (!hasCoordinates) return ''
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
    const delta = 0.006
    const bbox = [
      lon - delta,
      lat - delta,
      lon + delta,
      lat + delta,
    ].join(',')
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`
  },[hasCoordinates,latitude,longitude])

  function suggestedFee(distanceKm:number) {
    const extraKm = Math.max(0,distanceKm-pricing.includedKm)
    const raw = pricing.minimumFee + extraKm*pricing.perExtraKm
    const step = Math.max(.01,pricing.roundStep)
    return Math.max(pricing.minimumFee,Math.ceil(raw/step)*step)
  }

  async function locateAddress() {
    if (locating || address.trim().length < 6) return

    setLocating(true)
    setGeocodeError('')
    setResolvedAddress('')

    try {
      const locationContext = [storeCity,storeState,'Brasil']
        .map(value => value?.trim())
        .filter(Boolean)
        .join(', ')
      const geocodeAddress = locationContext
        ? `${address.trim()}, ${locationContext}`
        : address.trim()

      const response = await fetch('/api/geocode',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({address:geocodeAddress}),
      })

      const payload = await response.json() as {
        latitude?:number
        longitude?:number
        displayName?:string
        error?:string
      }

      if (!response.ok || payload.latitude == null || payload.longitude == null) {
        throw new Error(payload.error || 'Endereço não localizado.')
      }

      setLatitude(String(payload.latitude))
      setLongitude(String(payload.longitude))
      setResolvedAddress(payload.displayName || address)
      setLastLocatedAddress(address.trim())

      if (storeLatitude != null && storeLongitude != null) {
        const direct = haversineKm(
          storeLatitude,
          storeLongitude,
          payload.latitude,
          payload.longitude,
        )
        const roadDistance = Math.max(.1,direct*pricing.roadFactor)
        const estimated = Math.max(10,Math.round(8 + roadDistance*2.4))

        setDeliveryDistance(roadDistance.toFixed(2))
        setEstimatedMinutes(String(estimated))

        if (pricing.enabled) {
          setFee(suggestedFee(roadDistance).toFixed(2).replace('.',','))
        }
      }
    } catch (error) {
      setLatitude('')
      setLongitude('')
      setDeliveryDistance('')
      setEstimatedMinutes('')
      setGeocodeError(
        error instanceof Error
          ? error.message
          : 'Não foi possível localizar o endereço.',
      )
    } finally {
      setLocating(false)
    }
  }

  return <form action={action} className="form">
    {initialOrder ? <>
      <input type="hidden" name="store_order_id" value={initialOrder.orderId}/>
      <div className="notice">
        Este formulário está vinculado ao pedido integrado <strong>#{initialOrder.externalOrderId || initialOrder.orderId.replaceAll('-','').slice(0,7).toUpperCase()}</strong>.
        Ao publicar, a corrida ficará ligada ao pedido automaticamente.
      </div>
    </> : null}

    <section className="wallet-create-summary">
      <div>
        <span>Saldo disponível</span>
        <strong>R$ {availableBalance.toFixed(2).replace('.', ',')}</strong>
      </div>
      <div>
        <span>Saldo reservado</span>
        <strong>R$ {reservedBalance.toFixed(2).replace('.', ',')}</strong>
      </div>
      <p>
        Ao publicar, a taxa do entregador fica reservada na carteira até a conclusão ou cancelamento.
      </p>
    </section>

    <section className="form-section">
      <h2>Cliente e destino</h2>
      <div className="form-grid">
        <div className="field">
          <label>Nome do cliente</label>
          <input name="customer_name" required placeholder="Ex.: João Silva" defaultValue={initialOrder?.customerName ?? ''} />
        </div>
        <div className="field">
          <label>Telefone</label>
          <input name="customer_phone" placeholder="(21) 99999-9999" defaultValue={initialOrder?.customerPhone ?? ''} />
        </div>

        <div className="field full">
          <label>Endereço de entrega</label>
          <div className="geo-address-row">
            <input
              name="delivery_address"
              required
              placeholder="Ex.: Av. de Santa Cruz, 1200, Senador Camará"
              value={address}
              onChange={event => {
                setAddress(event.target.value)
                setResolvedAddress('')
                setGeocodeError('')
                setLatitude('')
                setLongitude('')
                setDeliveryDistance('')
                setEstimatedMinutes('')
              }}
              onBlur={() => {
                const current = address.trim()
                if (current.length >= 6 && current !== lastLocatedAddress && !locating) {
                  void locateAddress()
                }
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void locateAddress()
                }
              }}
            />
            <button
              type="button"
              className="geo-locate-button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => void locateAddress()}
              disabled={locating || address.trim().length < 6}
            >
              {locating ? 'IDENTIFICANDO...' : 'IDENTIFICAR LOCALIZAÇÃO'}
            </button>
          </div>
        </div>

        <input type="hidden" name="delivery_latitude" value={latitude}/>
        <input type="hidden" name="delivery_longitude" value={longitude}/>
        <input type="hidden" name="pickup_distance_km" value="0"/>

        <div className="geo-result full">
          <div className={hasCoordinates ? 'geo-status ok' : 'geo-status'}>
            <i/>
            <span>
              <strong>{hasCoordinates ? 'Localização identificada pelo sistema' : locating ? 'Identificando endereço...' : 'Digite o endereço do cliente'}</strong>
              {resolvedAddress || 'O ChamaEntrega encontra o ponto no mapa e calcula automaticamente distância, tempo e taxa.'}
            </span>
          </div>
          {deliveryDistance ? <div>
            <small>Distância da loja</small>
            <strong>{Number(deliveryDistance).toFixed(1).replace('.',',')} km</strong>
          </div> : null}
          {estimatedMinutes ? <div>
            <small>Tempo estimado</small>
            <strong>{estimatedMinutes} min</strong>
          </div> : null}
        </div>

        {hasCoordinates && mapPreviewUrl ? (
          <div className="geo-map-preview full">
            <div className="geo-map-preview-head">
              <div>
                <strong>Destino no mapa</strong>
                <span>Localização encontrada automaticamente a partir do endereço.</span>
              </div>
              <button type="button" onClick={() => void locateAddress()} disabled={locating}>
                Atualizar localização
              </button>
            </div>
            <iframe
              title="Localização do cliente"
              src={mapPreviewUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : null}

        {geocodeError ? <div className="error full">{geocodeError}</div> : null}

        <div className="field full">
          <label>Observações</label>
          <textarea name="customer_note" placeholder="Portaria, referência, instruções..." defaultValue={initialOrder?.customerNote ?? ''} />
        </div>
      </div>
    </section>

    <section className="form-section">
      <div className="pricing-section-head">
        <div>
          <h2>Pedido e pagamento</h2>
          <p>O ChamaEntrega calcula a taxa sugerida usando a distância estimada.</p>
        </div>
        <div className="pricing-rule">
          <span>A partir de</span>
          <strong>{money(pricing.minimumFee)}</strong>
          <small>
            {pricing.includedKm.toFixed(1).replace('.',',')} km inclusos · +{money(pricing.perExtraKm)}/km
          </small>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Taxa do entregador (R$)</label>
          <input
            name="delivery_fee"
            required
            inputMode="decimal"
            placeholder="7,50"
            value={fee}
            onChange={e => setFee(e.target.value)}
          />
          <small className="field-help">Você pode ajustar manualmente antes de publicar.</small>
        </div>
        <div className="field">
          <label>Total do pedido (R$)</label>
          <input name="order_total" inputMode="decimal" placeholder="79,90" defaultValue={initialOrder?.orderTotal ?? ''} />
        </div>
        <div className="field">
          <label>Forma de pagamento</label>
          <select name="payment_method" defaultValue={initialOrder?.paymentMethod ?? 'already_paid'}>
            <option value="already_paid">Já pago</option>
            <option value="pix">Pix na entrega</option>
            <option value="cash">Dinheiro</option>
            <option value="card_on_delivery">Cartão na entrega</option>
          </select>
        </div>
        <div className="field">
          <label>Quantidade de itens</label>
          <input name="item_count" type="number" min="1" defaultValue={initialOrder?.itemCount ?? 1} />
        </div>
        <div className="field">
          <label>Peso aproximado (kg)</label>
          <input name="package_weight_kg" inputMode="decimal" placeholder="1,2" />
        </div>
        <input type="hidden" name="estimated_minutes" value={estimatedMinutes}/>
        <input type="hidden" name="delivery_distance_km" value={deliveryDistance}/>

        <div className="delivery-auto-summary full">
          <div>
            <small>Localização</small>
            <strong>{hasCoordinates ? 'Identificada automaticamente' : 'Aguardando endereço'}</strong>
          </div>
          <div>
            <small>Distância</small>
            <strong>{deliveryDistance ? `${Number(deliveryDistance).toFixed(1).replace('.',',')} km` : '—'}</strong>
          </div>
          <div>
            <small>Tempo estimado</small>
            <strong>{estimatedMinutes ? `${estimatedMinutes} min` : '—'}</strong>
          </div>
        </div>
      </div>
    </section>

    <div className="notice">
      Informe apenas o endereço do cliente. O ChamaEntrega identifica a localização e calcula a rota automaticamente.
    </div>
    {!hasCoordinates ? <div className="notice geo-warning">Digite o endereço completo para o sistema identificar o destino no mapa.</div> : null}
    {insufficient ? <div className="error">Saldo insuficiente para publicar esta entrega. Adicione saldo no Financeiro.</div> : null}
    {state.error ? <div className="error">{state.error}</div> : null}

    <div className="form-actions">
      <div className="form-action-hint">
        {!hasCoordinates
          ? 'Digite o endereço para identificar a localização.'
          : feeValue <= 0
            ? 'Informe a taxa do entregador.'
            : insufficient
              ? 'Saldo insuficiente para publicar.'
              : 'Tudo pronto para buscar um entregador.'}
      </div>
      <button className="button button-dark" name="intent" value="draft" disabled={pending}>SALVAR RASCUNHO</button>
      <button
        className="button button-gold"
        name="intent"
        value="publish"
        disabled={pending || insufficient || feeValue <= 0 || !hasCoordinates}
      >
        {pending ? 'PUBLICANDO...' : 'PEDIDO PRONTO — BUSCAR ENTREGADOR'}
      </button>
    </div>
  </form>
}
