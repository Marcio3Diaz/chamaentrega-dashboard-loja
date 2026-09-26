'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
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

function onlyDigits(value:string) {
  return value.replace(/\D/g,'')
}

function formatCep(value:string) {
  const digits = onlyDigits(value).slice(0,8)
  return digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits
}

function formatPhone(value:string) {
  const digits = onlyDigits(value).slice(0,11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
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
  const [cep,setCep] = useState('')
  const [street,setStreet] = useState(initialOrder?.deliveryAddress ?? '')
  const [streetNumber,setStreetNumber] = useState('')
  const [complement,setComplement] = useState('')
  const [neighborhood,setNeighborhood] = useState('')
  const [city,setCity] = useState(storeCity ?? '')
  const [stateCode,setStateCode] = useState(storeState ?? '')
  const [phone,setPhone] = useState(initialOrder?.customerPhone ?? '')
  const [cepError,setCepError] = useState('')
  const [lookingUpCep,setLookingUpCep] = useState(false)
  const numberInputRef = useRef<HTMLInputElement | null>(null)
  const [latitude,setLatitude] = useState(initialOrder?.deliveryLatitude ?? '')
  const [longitude,setLongitude] = useState(initialOrder?.deliveryLongitude ?? '')
  const [deliveryDistance,setDeliveryDistance] = useState('')
  const [estimatedMinutes,setEstimatedMinutes] = useState('')
  const [resolvedAddress,setResolvedAddress] = useState('')
  const [geocodeError,setGeocodeError] = useState('')
  const [locating,setLocating] = useState(false)
  const [lastLocatedAddress,setLastLocatedAddress] = useState('')

  const address = useMemo(() => {
    const streetLine = [street.trim(),streetNumber.trim()].filter(Boolean).join(', ')
    const cityLine = [city.trim(),stateCode.trim()].filter(Boolean).join(' - ')
    return [
      streetLine,
      complement.trim(),
      neighborhood.trim(),
      cityLine,
      cep.trim() ? `CEP ${cep.trim()}` : '',
    ].filter(Boolean).join(', ')
  },[street,streetNumber,complement,neighborhood,city,stateCode,cep])

  function resetLocation() {
    setResolvedAddress('')
    setGeocodeError('')
    setLatitude('')
    setLongitude('')
    setDeliveryDistance('')
    setEstimatedMinutes('')
  }

  async function lookupCep() {
    const normalized = onlyDigits(cep)
    if (lookingUpCep || normalized.length !== 8) return

    setLookingUpCep(true)
    setCepError('')

    try {
      const response = await fetch(`/api/cep?cep=${normalized}`,{ cache:'no-store' })
      const payload = await response.json() as {
        street?:string
        neighborhood?:string
        city?:string
        state?:string
        cep?:string
        error?:string
      }

      if (!response.ok) throw new Error(payload.error || 'CEP não encontrado.')

      setCep(formatCep(payload.cep || normalized))
      setStreet(payload.street || '')
      setNeighborhood(payload.neighborhood || '')
      setCity(payload.city || '')
      setStateCode(payload.state || '')
      resetLocation()
      window.setTimeout(() => numberInputRef.current?.focus(),20)
    } catch (error) {
      setCepError(error instanceof Error ? error.message : 'Não foi possível consultar o CEP.')
    } finally {
      setLookingUpCep(false)
    }
  }

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
      const locationContext = [city || storeCity,stateCode || storeState,'Brasil']
        .map(value => value?.trim())
        .filter(Boolean)
        .join(', ')
      const geocodeAddress = address.includes(city || '')
        ? `${address.trim()}, Brasil`
        : locationContext
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
          <input
            name="customer_phone"
            inputMode="tel"
            placeholder="(21) 99999-9999"
            value={phone}
            onChange={event => setPhone(formatPhone(event.target.value))}
          />
        </div>

        <div className="delivery-address-builder full">
          <div className="delivery-address-head">
            <div>
              <span className="delivery-step-badge">1</span>
              <div>
                <strong>Localizar pelo CEP</strong>
                <small>Informe o CEP para preencher rua, bairro, cidade e estado automaticamente.</small>
              </div>
            </div>
            <span className={cep.length === 9 ? 'delivery-address-state ready' : 'delivery-address-state'}>
              {cep.length === 9 ? 'CEP preenchido' : '8 dígitos'}
            </span>
          </div>

          <div className="cep-search-row">
            <label className="field">
              <span>CEP</span>
              <input
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                value={cep}
                onChange={event => {
                  setCep(formatCep(event.target.value))
                  setCepError('')
                  resetLocation()
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void lookupCep()
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="cep-search-button"
              onClick={() => void lookupCep()}
              disabled={lookingUpCep || onlyDigits(cep).length !== 8}
            >
              {lookingUpCep ? 'BUSCANDO...' : 'BUSCAR CEP'}
            </button>
          </div>

          {cepError ? <div className="error">{cepError}</div> : null}

          <div className="address-fields-grid">
            <label className="field street">
              <span>Rua / Avenida</span>
              <input
                autoComplete="address-line1"
                placeholder="Rua ou avenida"
                value={street}
                onChange={event => { setStreet(event.target.value); resetLocation() }}
              />
            </label>
            <label className="field number">
              <span>Número</span>
              <input
                ref={numberInputRef}
                inputMode="numeric"
                placeholder="1200"
                value={streetNumber}
                onChange={event => { setStreetNumber(event.target.value.slice(0,20)); resetLocation() }}
              />
            </label>
            <label className="field complement">
              <span>Complemento</span>
              <input
                autoComplete="address-line2"
                placeholder="Apto, bloco, casa..."
                value={complement}
                onChange={event => { setComplement(event.target.value); resetLocation() }}
              />
            </label>
            <label className="field neighborhood">
              <span>Bairro</span>
              <input value={neighborhood} onChange={event => { setNeighborhood(event.target.value); resetLocation() }} />
            </label>
            <label className="field city">
              <span>Cidade</span>
              <input value={city} onChange={event => { setCity(event.target.value); resetLocation() }} />
            </label>
            <label className="field state">
              <span>UF</span>
              <input maxLength={2} value={stateCode} onChange={event => { setStateCode(event.target.value.toUpperCase()); resetLocation() }} />
            </label>
          </div>

          <div className="address-preview-card">
            <div>
              <span className="delivery-step-badge">2</span>
              <div>
                <small>Endereço que será usado na entrega</small>
                <strong>{address || 'Preencha o CEP e o número do cliente.'}</strong>
              </div>
            </div>
            <button
              type="button"
              className="geo-locate-button"
              onClick={() => void locateAddress()}
              disabled={locating || street.trim().length < 3 || !streetNumber.trim()}
            >
              {locating ? 'LOCALIZANDO...' : 'IDENTIFICAR NO MAPA'}
            </button>
          </div>

          <input type="hidden" name="delivery_address" value={address}/>
        </div>

        <input type="hidden" name="delivery_latitude" value={latitude}/>
        <input type="hidden" name="delivery_longitude" value={longitude}/>
        <input type="hidden" name="pickup_distance_km" value="0"/>

        <div className="geo-result full">
          <div className={hasCoordinates ? 'geo-status ok' : 'geo-status'}>
            <i/>
            <span>
              <strong>{hasCoordinates ? 'Destino confirmado no mapa' : locating ? 'Identificando endereço...' : 'Localização ainda não confirmada'}</strong>
              {resolvedAddress || 'Busque o CEP, informe o número e confirme o destino no mapa.'}
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
      O CEP ajuda a reduzir erros de endereço. Depois de preencher o número, confirme o destino no mapa antes de publicar.
    </div>
    {!hasCoordinates ? <div className="notice geo-warning">Busque o CEP, informe o número e clique em “Identificar no mapa”.</div> : null}
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
