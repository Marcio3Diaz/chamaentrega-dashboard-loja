'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'
import { StoreLogoUpload } from '@/components/store-logo-upload'

export type StoreSettingsData = {
  storeId: string
  userId: string
  name: string
  phone: string | null
  logoUrl: string | null
  address: string
  latitude: number | null
  longitude: number | null
  isActive: boolean
  zipCode: string
  street: string
  streetNumber: string
  complement: string
  neighborhood: string
  city: string
  state: string
  adminName: string
  adminPhone: string
  adminEmail: string
  adminRole: string
  walletBalance: number
  walletReserved: number
  walletAvailable: number
}

type Props = {
  initialData: StoreSettingsData
}

type Tab = 'store' | 'address' | 'account' | 'payments'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9()+\-\s]/g, '').slice(0, 24)
}

function normalizeZip(value: string) {
  const digits = value.replace(/\D/g, '').slice(0,8)
  return digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits
}

function buildAddress(data: {
  street: string
  streetNumber: string
  complement: string
  neighborhood: string
  city: string
  state: string
  fallback: string
}) {
  const line1 = [data.street.trim(), data.streetNumber.trim()].filter(Boolean).join(', ')
  const line2 = [data.complement.trim(), data.neighborhood.trim()].filter(Boolean).join(' - ')
  const line3 = [data.city.trim(), data.state.trim().toUpperCase()].filter(Boolean).join(' - ')
  const built = [line1,line2,line3].filter(Boolean).join(', ')
  return built || data.fallback
}

export function StoreSettingsPanel({ initialData }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [tab,setTab] = useState<Tab>('store')
  const [name,setName] = useState(initialData.name)
  const [phone,setPhone] = useState(initialData.phone ?? '')
  const [isActive,setIsActive] = useState(initialData.isActive)

  const [zipCode,setZipCode] = useState(initialData.zipCode)
  const [street,setStreet] = useState(initialData.street)
  const [streetNumber,setStreetNumber] = useState(initialData.streetNumber)
  const [complement,setComplement] = useState(initialData.complement)
  const [neighborhood,setNeighborhood] = useState(initialData.neighborhood)
  const [city,setCity] = useState(initialData.city)
  const [state,setState] = useState(initialData.state)

  const [adminName,setAdminName] = useState(initialData.adminName)
  const [adminPhone,setAdminPhone] = useState(initialData.adminPhone)

  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [messageType,setMessageType] = useState<'success'|'error'>('success')

  const computedAddress = buildAddress({
    street,
    streetNumber,
    complement,
    neighborhood,
    city,
    state,
    fallback: initialData.address,
  })

  function notify(text: string, type: 'success'|'error' = 'success') {
    setMessage(text)
    setMessageType(type)
    window.setTimeout(() => setMessage(''), 4200)
  }

  async function saveStore(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()

    if (cleanName.length < 2) {
      notify('Informe um nome válido para a loja.', 'error')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('stores')
      .update({
        name: cleanName,
        phone: phone.trim() || null,
        is_active: isActive,
      })
      .eq('id', initialData.storeId)
      .eq('owner_id', initialData.userId)

    setSaving(false)

    if (error) {
      notify('Não foi possível salvar os dados da loja.', 'error')
      return
    }

    notify('Dados da loja atualizados.')
    router.refresh()
  }

  async function saveAddress(event: FormEvent) {
    event.preventDefault()

    if (!city.trim() || state.trim().length < 2) {
      notify('Informe pelo menos cidade e estado.', 'error')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('stores')
      .update({
        zip_code: zipCode.trim() || null,
        street: street.trim() || null,
        street_number: streetNumber.trim() || null,
        complement: complement.trim() || null,
        neighborhood: neighborhood.trim() || null,
        city: city.trim() || null,
        state: state.trim().toUpperCase().slice(0,2) || null,
        address: computedAddress,
      })
      .eq('id', initialData.storeId)
      .eq('owner_id', initialData.userId)

    setSaving(false)

    if (error) {
      notify('Não foi possível salvar o endereço.', 'error')
      return
    }

    notify('Endereço de retirada atualizado.')
    router.refresh()
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault()

    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: adminName.trim() || null,
        phone: adminPhone.trim() || null,
      })
      .eq('id', initialData.userId)

    setSaving(false)

    if (error) {
      notify('Não foi possível atualizar o administrador.', 'error')
      return
    }

    notify('Dados do administrador atualizados.')
    router.refresh()
  }

  return (
    <div className="settings-page">
      <section className="settings-hero">
        <div>
          <div className="eyebrow">CENTRAL DA LOJA</div>
          <h1>Configurações</h1>
          <p>Gerencie os dados que o ChamaEntrega usa na operação da sua loja.</p>
        </div>

        <div className="settings-store-status">
          <span className={isActive ? 'online' : 'offline'}><i />{isActive ? 'Loja ativa' : 'Loja pausada'}</span>
        </div>
      </section>

      <section className="settings-layout">
        <aside className="settings-tabs">
          <button className={tab === 'store' ? 'active' : ''} onClick={() => setTab('store')}>
            <span><Icon name="store" size={17}/></span>
            <div><strong>Dados da loja</strong><small>Nome, logo e operação</small></div>
          </button>

          <button className={tab === 'address' ? 'active' : ''} onClick={() => setTab('address')}>
            <span><Icon name="pin" size={17}/></span>
            <div><strong>Endereço</strong><small>Ponto de retirada</small></div>
          </button>

          <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>
            <span><Icon name="user" size={17}/></span>
            <div><strong>Minha conta</strong><small>Administrador</small></div>
          </button>

          <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
            <span><Icon name="money" size={17}/></span>
            <div><strong>Carteira e Pix</strong><small>Saldo pré-pago</small></div>
          </button>
        </aside>

        <div className="settings-content">
          {tab === 'store' ? (
            <form className="settings-panel" onSubmit={saveStore}>
              <div className="settings-panel-head">
                <div>
                  <span className="eyebrow">IDENTIDADE E OPERAÇÃO</span>
                  <h2>Dados da loja</h2>
                  <p>Essas informações identificam sua loja no painel e na rede de entregadores.</p>
                </div>
              </div>

              <div className="settings-logo-row">
                <StoreLogoUpload
                  storeId={initialData.storeId}
                  userId={initialData.userId}
                  storeName={name || initialData.name}
                  logoUrl={initialData.logoUrl}
                  variant="sidebar"
                />
                <div>
                  <strong>Logo da loja</strong>
                  <span>Clique na imagem para trocar. PNG, JPG ou WebP de até 5 MB.</span>
                </div>
              </div>

              <div className="settings-form-grid">
                <label className="settings-field wide">
                  <span>Nome da loja</span>
                  <input value={name} onChange={event => setName(event.target.value.slice(0,100))} required />
                </label>

                <label className="settings-field">
                  <span>Telefone da loja</span>
                  <input
                    value={phone}
                    onChange={event => setPhone(normalizePhone(event.target.value))}
                    placeholder="(21) 99999-9999"
                  />
                </label>

                <div className="settings-field">
                  <span>Status operacional</span>
                  <button
                    type="button"
                    className={`settings-toggle ${isActive ? 'on' : ''}`}
                    onClick={() => setIsActive(value => !value)}
                  >
                    <i />
                    <b>{isActive ? 'Loja ativa' : 'Loja pausada'}</b>
                  </button>
                </div>
              </div>

              <div className="settings-warning">
                <Icon name="lightning" size={17}/>
                <div>
                  <strong>{isActive ? 'Sua loja está recebendo a operação normalmente.' : 'A loja será marcada como pausada.'}</strong>
                  <span>O status é usado pelo ecossistema ChamaEntrega para identificar lojas ativas.</span>
                </div>
              </div>

              <div className="settings-actions">
                <button type="submit" className="settings-save" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          ) : null}

          {tab === 'address' ? (
            <form className="settings-panel" onSubmit={saveAddress}>
              <div className="settings-panel-head">
                <div>
                  <span className="eyebrow">PONTO DE RETIRADA</span>
                  <h2>Endereço da loja</h2>
                  <p>Esse é o endereço usado como origem das entregas.</p>
                </div>
                <Link href="/mapa" className="settings-secondary-action"><Icon name="map" size={15}/> Ver no mapa</Link>
              </div>

              <div className="settings-current-address">
                <span className="settings-address-icon"><Icon name="pin" size={20}/></span>
                <div>
                  <small>Endereço usado atualmente</small>
                  <strong>{computedAddress}</strong>
                  {initialData.latitude != null && initialData.longitude != null ? (
                    <span>GPS cadastrado: {initialData.latitude.toFixed(5)}, {initialData.longitude.toFixed(5)}</span>
                  ) : (
                    <span>Sem coordenadas GPS cadastradas.</span>
                  )}
                </div>
              </div>

              <div className="settings-form-grid address">
                <label className="settings-field">
                  <span>CEP</span>
                  <input value={zipCode} onChange={event => setZipCode(normalizeZip(event.target.value))} placeholder="00000-000" />
                </label>

                <label className="settings-field span-2">
                  <span>Rua / Avenida</span>
                  <input value={street} onChange={event => setStreet(event.target.value.slice(0,160))} />
                </label>

                <label className="settings-field">
                  <span>Número</span>
                  <input value={streetNumber} onChange={event => setStreetNumber(event.target.value.slice(0,20))} />
                </label>

                <label className="settings-field">
                  <span>Complemento</span>
                  <input value={complement} onChange={event => setComplement(event.target.value.slice(0,100))} />
                </label>

                <label className="settings-field">
                  <span>Bairro</span>
                  <input value={neighborhood} onChange={event => setNeighborhood(event.target.value.slice(0,100))} />
                </label>

                <label className="settings-field span-2">
                  <span>Cidade</span>
                  <input value={city} onChange={event => setCity(event.target.value.slice(0,100))} required />
                </label>

                <label className="settings-field">
                  <span>Estado</span>
                  <input
                    value={state}
                    onChange={event => setState(event.target.value.replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,2))}
                    placeholder="RJ"
                    maxLength={2}
                    required
                  />
                </label>
              </div>

              <div className="settings-actions">
                <button type="submit" className="settings-save" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar endereço'}
                </button>
              </div>
            </form>
          ) : null}

          {tab === 'account' ? (
            <form className="settings-panel" onSubmit={saveAccount}>
              <div className="settings-panel-head">
                <div>
                  <span className="eyebrow">ACESSO AO PORTAL</span>
                  <h2>Administrador</h2>
                  <p>Dados pessoais do responsável que acessa esta loja.</p>
                </div>
              </div>

              <div className="settings-account-card">
                <span className="settings-account-avatar">
                  {(adminName || initialData.adminEmail || 'A').slice(0,1).toUpperCase()}
                </span>
                <div>
                  <strong>{adminName || 'Administrador'}</strong>
                  <span>{initialData.adminEmail}</span>
                  <small>{initialData.adminRole === 'admin' ? 'Administrador do sistema' : 'Proprietário da loja'}</small>
                </div>
              </div>

              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>Nome do administrador</span>
                  <input value={adminName} onChange={event => setAdminName(event.target.value.slice(0,120))} />
                </label>

                <label className="settings-field">
                  <span>Telefone</span>
                  <input value={adminPhone} onChange={event => setAdminPhone(normalizePhone(event.target.value))} />
                </label>

                <label className="settings-field wide readonly">
                  <span>E-mail de acesso</span>
                  <input value={initialData.adminEmail} readOnly />
                  <small>O e-mail vem da sua conta de autenticação e não é alterado por esta tela.</small>
                </label>
              </div>

              <div className="settings-actions">
                <button type="submit" className="settings-save" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar administrador'}
                </button>
              </div>
            </form>
          ) : null}

          {tab === 'payments' ? (
            <div className="settings-panel">
              <div className="settings-panel-head">
                <div>
                  <span className="eyebrow">CARTEIRA PRÉ-PAGA</span>
                  <h2>Carteira e Pix</h2>
                  <p>As entregas são pagas com o saldo pré-pago da sua carteira ChamaEntrega.</p>
                </div>
                <Link href="/financeiro" className="settings-secondary-action">Abrir financeiro →</Link>
              </div>

              <div className="settings-wallet-grid">
                <article className="primary">
                  <span>Saldo disponível</span>
                  <strong>{money(initialData.walletAvailable)}</strong>
                  <small>Disponível para novas entregas</small>
                </article>
                <article>
                  <span>Saldo reservado</span>
                  <strong>{money(initialData.walletReserved)}</strong>
                  <small>Protegido em corridas ativas</small>
                </article>
                <article>
                  <span>Saldo total</span>
                  <strong>{money(initialData.walletBalance)}</strong>
                  <small>Disponível + reservado</small>
                </article>
              </div>

              <div className="settings-pix-card">
                <span className="settings-pix-icon">PIX</span>
                <div>
                  <strong>Recarga via Pix</strong>
                  <p>Gere um QR Code ou Pix Copia e Cola no Financeiro. O saldo entra na carteira após a confirmação do pagamento.</p>
                </div>
                <Link href="/financeiro" className="settings-pix-button">Recarregar carteira</Link>
              </div>

              <div className="settings-payment-flow">
                <div><b>1</b><span><strong>Recarregue por Pix</strong><small>Adicione saldo antes de publicar as corridas.</small></span></div>
                <div><b>2</b><span><strong>Taxa reservada</strong><small>Ao publicar uma entrega, o valor fica protegido.</small></span></div>
                <div><b>3</b><span><strong>Pagamento automático</strong><small>Ao concluir, a taxa é debitada da carteira.</small></span></div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {message ? (
        <div className={`settings-toast ${messageType}`} role="status">
          <span>{messageType === 'success' ? '✓' : '!'}</span>
          {message}
        </div>
      ) : null}
    </div>
  )
}
