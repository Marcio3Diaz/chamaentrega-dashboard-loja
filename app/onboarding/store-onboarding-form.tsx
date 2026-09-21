'use client'

import { useActionState, useMemo, useState } from 'react'
import { createFirstStoreAction, type OnboardingState } from './actions'

const initialState:OnboardingState = {}

export function StoreOnboardingForm() {
  const [state,action,pending] = useActionState(createFirstStoreAction,initialState)
  const [locating,setLocating] = useState(false)
  const [locationError,setLocationError] = useState('')
  const [resolvedAddress,setResolvedAddress] = useState('')
  const [latitude,setLatitude] = useState('')
  const [longitude,setLongitude] = useState('')

  const [street,setStreet] = useState('')
  const [streetNumber,setStreetNumber] = useState('')
  const [complement,setComplement] = useState('')
  const [neighborhood,setNeighborhood] = useState('')
  const [city,setCity] = useState('')
  const [stateCode,setStateCode] = useState('')
  const [zipCode,setZipCode] = useState('')

  const addressForSearch = useMemo(
    () => [
      street,
      streetNumber,
      complement,
      neighborhood,
      city,
      stateCode,
      zipCode ? `CEP ${zipCode}` : '',
      'Brasil',
    ].filter(Boolean).join(', '),
    [street,streetNumber,complement,neighborhood,city,stateCode,zipCode],
  )

  async function locateStore() {
    if (locating || !street.trim() || !streetNumber.trim() || !city.trim() || !stateCode.trim()) {
      setLocationError('Preencha rua, número, cidade e estado antes de localizar.')
      return
    }

    setLocating(true)
    setLocationError('')

    try {
      const response = await fetch('/api/geocode',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({address:addressForSearch}),
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
      setResolvedAddress(payload.displayName || addressForSearch)
    } catch (error) {
      setLatitude('')
      setLongitude('')
      setResolvedAddress('')
      setLocationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível localizar o endereço.',
      )
    } finally {
      setLocating(false)
    }
  }

  function invalidateLocation() {
    setLatitude('')
    setLongitude('')
    setResolvedAddress('')
  }

  return (
    <form action={action} className="onboarding-form">
      <input type="hidden" name="latitude" value={latitude}/>
      <input type="hidden" name="longitude" value={longitude}/>
      <input type="hidden" name="resolved_address" value={resolvedAddress}/>

      <section className="onboarding-section">
        <div className="onboarding-section-number">01</div>
        <div className="onboarding-section-copy">
          <div className="eyebrow">IDENTIDADE DA EMPRESA</div>
          <h2>Como sua loja vai aparecer?</h2>
          <p>Essas informações identificam sua operação para você e para os entregadores.</p>
        </div>

        <div className="onboarding-grid">
          <label className="field">
            <span>Nome da loja</span>
            <input name="store_name" placeholder="Ex.: Minha Hamburgueria" required/>
          </label>

          <label className="field">
            <span>Telefone da loja</span>
            <input name="store_phone" autoComplete="tel" placeholder="(21) 99999-9999"/>
          </label>

          <label className="field">
            <span>Razão social <small>opcional</small></span>
            <input name="legal_name" placeholder="Nome empresarial"/>
          </label>

          <label className="field">
            <span>CNPJ ou CPF <small>opcional</small></span>
            <input name="tax_id" inputMode="numeric" placeholder="Documento da empresa"/>
          </label>
        </div>
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-number">02</div>
        <div className="onboarding-section-copy">
          <div className="eyebrow">PONTO DE RETIRADA</div>
          <h2>Onde os entregadores retiram os pedidos?</h2>
          <p>O endereço será usado para calcular distância, taxa e rota das entregas.</p>
        </div>

        <div className="onboarding-grid">
          <label className="field">
            <span>CEP</span>
            <input
              name="zip_code"
              value={zipCode}
              onChange={event => {
                setZipCode(event.target.value)
                invalidateLocation()
              }}
              placeholder="00000-000"
            />
          </label>

          <label className="field wide">
            <span>Rua / Avenida</span>
            <input
              name="street"
              value={street}
              onChange={event => {
                setStreet(event.target.value)
                invalidateLocation()
              }}
              placeholder="Nome da rua"
              required
            />
          </label>

          <label className="field">
            <span>Número</span>
            <input
              name="street_number"
              value={streetNumber}
              onChange={event => {
                setStreetNumber(event.target.value)
                invalidateLocation()
              }}
              placeholder="123"
              required
            />
          </label>

          <label className="field">
            <span>Complemento</span>
            <input
              name="complement"
              value={complement}
              onChange={event => {
                setComplement(event.target.value)
                invalidateLocation()
              }}
              placeholder="Loja A, sala 2..."
            />
          </label>

          <label className="field">
            <span>Bairro</span>
            <input
              name="neighborhood"
              value={neighborhood}
              onChange={event => {
                setNeighborhood(event.target.value)
                invalidateLocation()
              }}
              placeholder="Bairro"
            />
          </label>

          <label className="field">
            <span>Cidade</span>
            <input
              name="city"
              value={city}
              onChange={event => {
                setCity(event.target.value)
                invalidateLocation()
              }}
              placeholder="Rio de Janeiro"
              required
            />
          </label>

          <label className="field">
            <span>Estado</span>
            <input
              name="state"
              value={stateCode}
              onChange={event => {
                setStateCode(event.target.value.toUpperCase().slice(0,2))
                invalidateLocation()
              }}
              placeholder="RJ"
              maxLength={2}
              required
            />
          </label>
        </div>

        <div className="onboarding-location-box">
          <button
            type="button"
            className="button onboarding-locate"
            onClick={() => void locateStore()}
            disabled={locating}
          >
            {locating ? 'LOCALIZANDO...' : 'LOCALIZAR MINHA LOJA'}
          </button>

          <div className={latitude && longitude ? 'onboarding-location-status ok' : 'onboarding-location-status'}>
            <i/>
            <span>
              <strong>{latitude && longitude ? 'Endereço confirmado' : 'Localização pendente'}</strong>
              {resolvedAddress || 'Confirme o ponto antes de criar sua operação.'}
            </span>
          </div>
        </div>

        {locationError ? <div className="error">{locationError}</div> : null}
      </section>

      <section className="onboarding-finish">
        <div>
          <div className="eyebrow">PRONTO PARA COMEÇAR</div>
          <h2>Crie sua operação ChamaEntrega</h2>
          <p>
            Sua carteira, regras iniciais de taxa e painel serão preparados automaticamente.
            A logo poderá ser adicionada depois em Configurações.
          </p>
        </div>

        <button
          className="button button-gold onboarding-submit"
          disabled={pending || !latitude || !longitude}
        >
          {pending ? 'CRIANDO SUA LOJA...' : 'CRIAR LOJA E ABRIR PAINEL'}
        </button>
      </section>

      {state.error ? <div className="error">{state.error}</div> : null}
    </form>
  )
}
