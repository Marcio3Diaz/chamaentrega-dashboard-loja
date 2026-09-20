'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'

export type IntegrationProvider = 'whatsapp' | 'ifood' | '99food' | 'goomer' | 'own_menu'
export type IntegrationStatus = 'not_configured' | 'configured' | 'pending' | 'connected' | 'error'

export type StoreIntegrationRow = {
  id: string
  storeId: string
  provider: IntegrationProvider
  status: IntegrationStatus
  isEnabled: boolean
  publicConfig: Record<string,unknown>
  lastSyncedAt: string | null
  lastError: string | null
  updatedAt: string
}

type Props = {
  storeId: string
  storeName: string
  storePhone: string | null
  initialRows: StoreIntegrationRow[]
}

type Draft = {
  phone?: string
  menuUrl?: string
  merchantReference?: string
  autoImport?: boolean
}

const providers: Array<{
  key: IntegrationProvider
  name: string
  short: string
  description: string
  category: string
  color: string
  capabilities: string[]
}> = [
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    short: 'WA',
    description: 'Centralize o contato da loja e abra conversas de pedidos pelo número comercial.',
    category: 'Mensageria',
    color: 'green',
    capabilities: ['Número comercial', 'Atalho de atendimento', 'Pedidos por conversa'],
  },
  {
    key: 'ifood',
    name: 'iFood',
    short: 'iF',
    description: 'Prepare a conexão para importar pedidos e acionar a entrega própria pelo ChamaEntrega.',
    category: 'Marketplace',
    color: 'red',
    capabilities: ['Pedidos', 'Status', 'Entrega própria'],
  },
  {
    key: '99food',
    name: '99Food',
    short: '99',
    description: 'Cadastre a referência da loja para futura integração oficial com pedidos e entregas.',
    category: 'Marketplace',
    color: 'yellow',
    capabilities: ['Pedidos', 'Status', 'Entrega própria'],
  },
  {
    key: 'goomer',
    name: 'Goomer',
    short: 'G',
    description: 'Prepare o vínculo com o seu cardápio Goomer para receber pedidos no fluxo logístico.',
    category: 'Cardápio digital',
    color: 'purple',
    capabilities: ['Cardápio', 'Pedidos', 'Webhook'],
  },
  {
    key: 'own_menu',
    name: 'Cardápio próprio',
    short: 'CE',
    description: 'Vincule o seu cardápio digital próprio e use o ChamaEntrega como camada de entrega.',
    category: 'Canal próprio',
    color: 'gold',
    capabilities: ['URL do cardápio', 'Pedidos próprios', 'Entrega ChamaEntrega'],
  },
]

const statusLabel: Record<IntegrationStatus,string> = {
  not_configured: 'Não configurado',
  configured: 'Configurado',
  pending: 'Aguardando conexão',
  connected: 'Conectado',
  error: 'Atenção',
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, '').slice(0,18)
}

function digits(value: string) {
  return value.replace(/\D/g,'')
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown) {
  return value === true
}

export function StoreIntegrationsPanel({
  storeId,
  storeName,
  storePhone,
  initialRows,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [rows,setRows] = useState(initialRows)
  const [selected,setSelected] = useState<IntegrationProvider>('whatsapp')
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [messageType,setMessageType] = useState<'success'|'error'>('success')
  const [liveState,setLiveState] = useState('CONECTANDO')

  const rowByProvider = useMemo(
    () => new Map(rows.map(row => [row.provider,row])),
    [rows],
  )

  const initialDrafts = useMemo(() => {
    const result = {} as Record<IntegrationProvider,Draft>

    for (const provider of providers) {
      const row = rowByProvider.get(provider.key)
      const config = row?.publicConfig ?? {}

      result[provider.key] = {
        phone:
          provider.key === 'whatsapp'
            ? asString(config.phone) || storePhone || ''
            : undefined,
        menuUrl:
          provider.key === 'own_menu'
            ? asString(config.menu_url)
            : undefined,
        merchantReference:
          ['ifood','99food','goomer'].includes(provider.key)
            ? asString(config.merchant_reference)
            : undefined,
        autoImport: asBoolean(config.auto_import),
      }
    }

    return result
  }, [rowByProvider,storePhone])

  const [drafts,setDrafts] = useState<Record<IntegrationProvider,Draft>>(initialDrafts)

  useEffect(() => {
    setDrafts(initialDrafts)
  }, [initialDrafts])

  useEffect(() => {
    const channel = supabase
      .channel(`store-integrations:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_integrations',
          filter: `store_id=eq.${storeId}`,
        },
        payload => {
          const next = (payload.new ?? payload.old) as any
          if (!next?.provider) return

          if (payload.eventType === 'DELETE') {
            setRows(current => current.filter(row => row.provider !== next.provider))
            return
          }

          const mapped: StoreIntegrationRow = {
            id: next.id,
            storeId: next.store_id,
            provider: next.provider,
            status: next.status,
            isEnabled: Boolean(next.is_enabled),
            publicConfig: next.public_config ?? {},
            lastSyncedAt: next.last_synced_at,
            lastError: next.last_error,
            updatedAt: next.updated_at,
          }

          setRows(current => {
            const found = current.some(row => row.provider === mapped.provider)
            return found
              ? current.map(row => row.provider === mapped.provider ? mapped : row)
              : [...current,mapped]
          })
        },
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setLiveState('AO VIVO')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveState('RECONECTANDO')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [storeId,supabase])

  const selectedProvider = providers.find(item => item.key === selected)!
  const selectedRow = rowByProvider.get(selected)
  const selectedDraft = drafts[selected]

  const summary = useMemo(() => {
    const connected = rows.filter(row => row.status === 'connected').length
    const configured = rows.filter(row => row.status === 'configured').length
    const pending = rows.filter(row => row.status === 'pending').length
    return { connected,configured,pending,total:providers.length }
  }, [rows])

  function notify(text: string,type: 'success'|'error' = 'success') {
    setMessage(text)
    setMessageType(type)
    window.setTimeout(() => setMessage(''),4200)
  }

  function updateDraft(provider: IntegrationProvider,patch: Partial<Draft>) {
    setDrafts(current => ({
      ...current,
      [provider]: {
        ...current[provider],
        ...patch,
      },
    }))
  }

  function buildConfig(provider: IntegrationProvider): Record<string,unknown> {
    const draft = drafts[provider]

    if (provider === 'whatsapp') {
      return {
        phone: draft.phone?.trim() || '',
        auto_import: Boolean(draft.autoImport),
      }
    }

    if (provider === 'own_menu') {
      return {
        menu_url: draft.menuUrl?.trim() || '',
        auto_import: Boolean(draft.autoImport),
      }
    }

    return {
      merchant_reference: draft.merchantReference?.trim() || '',
      auto_import: Boolean(draft.autoImport),
    }
  }

  async function save(provider: IntegrationProvider, nextStatus?: IntegrationStatus) {
    const config = buildConfig(provider)

    if (provider === 'whatsapp' && !asString(config.phone)) {
      notify('Informe o número comercial do WhatsApp.','error')
      return
    }

    if (provider === 'own_menu') {
      const url = asString(config.menu_url)
      if (!url) {
        notify('Informe a URL do seu cardápio.','error')
        return
      }

      try {
        const parsed = new URL(url)
        if (!['http:','https:'].includes(parsed.protocol)) throw new Error()
      } catch {
        notify('Informe uma URL válida para o cardápio.','error')
        return
      }
    }

    if (['ifood','99food','goomer'].includes(provider) && !asString(config.merchant_reference)) {
      notify('Informe a referência comercial da loja antes de solicitar a conexão.','error')
      return
    }

    const status: IntegrationStatus =
      nextStatus ??
      (provider === 'whatsapp' || provider === 'own_menu' ? 'configured' : 'pending')

    setSaving(true)

    const { data,error } = await supabase
      .from('store_integrations')
      .upsert({
        store_id: storeId,
        provider,
        status,
        is_enabled: provider === 'whatsapp' || provider === 'own_menu',
        public_config: config,
        last_error: null,
      }, {
        onConflict: 'store_id,provider',
      })
      .select('id,store_id,provider,status,is_enabled,public_config,last_synced_at,last_error,updated_at')
      .single()

    setSaving(false)

    if (error || !data) {
      notify('Não foi possível salvar esta integração.','error')
      return
    }

    const mapped: StoreIntegrationRow = {
      id: data.id,
      storeId: data.store_id,
      provider: data.provider,
      status: data.status,
      isEnabled: Boolean(data.is_enabled),
      publicConfig: data.public_config ?? {},
      lastSyncedAt: data.last_synced_at,
      lastError: data.last_error,
      updatedAt: data.updated_at,
    }

    setRows(current => {
      const found = current.some(row => row.provider === mapped.provider)
      return found
        ? current.map(row => row.provider === mapped.provider ? mapped : row)
        : [...current,mapped]
    })

    notify(
      provider === 'ifood' || provider === '99food' || provider === 'goomer'
        ? 'Solicitação registrada. A conexão oficial ainda depende das credenciais do parceiro.'
        : 'Configuração salva.',
    )
  }

  async function disconnect(provider: IntegrationProvider) {
    setSaving(true)

    const { error } = await supabase
      .from('store_integrations')
      .update({
        status:'not_configured',
        is_enabled:false,
        last_error:null,
      })
      .eq('store_id',storeId)
      .eq('provider',provider)

    setSaving(false)

    if (error) {
      notify('Não foi possível desativar a integração.','error')
      return
    }

    setRows(current => current.map(row =>
      row.provider === provider
        ? { ...row,status:'not_configured',isEnabled:false }
        : row,
    ))

    notify('Integração desativada.')
  }

  function openWhatsApp() {
    const phone = digits(drafts.whatsapp.phone ?? '')
    if (!phone) {
      notify('Configure primeiro o número do WhatsApp.','error')
      return
    }

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(`Olá! Este é um teste do WhatsApp da ${storeName} no ChamaEntrega.`)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  function openMenu() {
    const url = drafts.own_menu.menuUrl?.trim()
    if (!url) {
      notify('Configure primeiro a URL do cardápio.','error')
      return
    }
    window.open(url,'_blank','noopener,noreferrer')
  }

  return (
    <div className="integrations-page">
      <section className="integrations-hero">
        <div>
          <div className="eyebrow">ECOSSISTEMA DA LOJA</div>
          <h1>Integrações</h1>
          <p>Conecte seus canais de venda ao fluxo de entregas do ChamaEntrega.</p>
        </div>
        <span className={`integrations-live ${liveState === 'AO VIVO' ? 'online' : ''}`}><i />{liveState}</span>
      </section>

      <section className="integrations-stats">
        <article><span>Canais disponíveis</span><strong>{summary.total}</strong><small>integrações previstas</small></article>
        <article><span>Conectados</span><strong>{summary.connected}</strong><small>integrações oficiais ativas</small></article>
        <article><span>Configurados</span><strong>{summary.configured}</strong><small>prontos no painel</small></article>
        <article><span>Aguardando</span><strong>{summary.pending}</strong><small>dependem do parceiro</small></article>
      </section>

      <section className="integrations-layout">
        <div className="integrations-grid">
          {providers.map(provider => {
            const row = rowByProvider.get(provider.key)
            const status = row?.status ?? 'not_configured'
            const active = provider.key === selected

            return (
              <button
                type="button"
                key={provider.key}
                className={`integration-card ${active ? 'selected' : ''}`}
                onClick={() => setSelected(provider.key)}
              >
                <span className={`integration-logo ${provider.color}`}>{provider.short}</span>
                <span className="integration-card-copy">
                  <span className="integration-card-head">
                    <strong>{provider.name}</strong>
                    <b className={`integration-status ${status}`}>{statusLabel[status]}</b>
                  </span>
                  <small>{provider.category}</small>
                  <span>{provider.description}</span>
                  <span className="integration-capabilities">
                    {provider.capabilities.map(item => <i key={item}>{item}</i>)}
                  </span>
                </span>
                <span className="integration-card-chevron">›</span>
              </button>
            )
          })}
        </div>

        <aside className="integration-detail">
          <div className="integration-detail-head">
            <span className={`integration-logo large ${selectedProvider.color}`}>{selectedProvider.short}</span>
            <div>
              <span className="eyebrow">{selectedProvider.category}</span>
              <h2>{selectedProvider.name}</h2>
              <p>{selectedProvider.description}</p>
            </div>
          </div>

          <div className="integration-detail-status">
            <span>Estado atual</span>
            <b className={`integration-status ${selectedRow?.status ?? 'not_configured'}`}>
              {statusLabel[selectedRow?.status ?? 'not_configured']}
            </b>
          </div>

          {selected === 'whatsapp' ? (
            <div className="integration-form">
              <label>
                <span>Número comercial</span>
                <input
                  value={selectedDraft.phone ?? ''}
                  onChange={event => updateDraft('whatsapp',{ phone:normalizePhone(event.target.value) })}
                  placeholder="+5521999999999"
                />
                <small>Use o número com DDI e DDD.</small>
              </label>

              <label className="integration-switch-row">
                <span>
                  <strong>Identificar pedidos do WhatsApp</strong>
                  <small>Salva a preferência para o fluxo de pedidos recebidos por conversa.</small>
                </span>
                <button
                  type="button"
                  className={`integration-switch ${selectedDraft.autoImport ? 'on' : ''}`}
                  onClick={() => updateDraft('whatsapp',{ autoImport:!selectedDraft.autoImport })}
                ><i /></button>
              </label>

              <div className="integration-note">
                <Icon name="chat" size={17}/>
                <span>Esta etapa configura o canal comercial e o atalho de atendimento. Automação oficial via WhatsApp Business API exigirá credenciais próprias do provedor.</span>
              </div>

              <div className="integration-actions">
                {selectedRow && selectedRow.status !== 'not_configured' ? (
                  <button type="button" className="integration-danger" onClick={() => void disconnect('whatsapp')} disabled={saving}>Desativar</button>
                ) : null}
                <button type="button" className="integration-secondary" onClick={openWhatsApp}>Testar WhatsApp</button>
                <button type="button" className="integration-primary" onClick={() => void save('whatsapp')} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar configuração'}
                </button>
              </div>
            </div>
          ) : null}

          {selected === 'own_menu' ? (
            <div className="integration-form">
              <label>
                <span>URL do cardápio</span>
                <input
                  value={selectedDraft.menuUrl ?? ''}
                  onChange={event => updateDraft('own_menu',{ menuUrl:event.target.value })}
                  placeholder="https://seucardapio.com.br"
                />
              </label>

              <label className="integration-switch-row">
                <span>
                  <strong>Receber pedidos no ChamaEntrega</strong>
                  <small>Deixa registrada a preferência para o fluxo do cardápio próprio.</small>
                </span>
                <button
                  type="button"
                  className={`integration-switch ${selectedDraft.autoImport ? 'on' : ''}`}
                  onClick={() => updateDraft('own_menu',{ autoImport:!selectedDraft.autoImport })}
                ><i /></button>
              </label>

              <div className="integration-note">
                <Icon name="link" size={17}/>
                <span>O vínculo da URL já pode ser salvo. A importação automática de pedidos será ativada quando o webhook/API do seu cardápio estiver definido.</span>
              </div>

              <div className="integration-actions">
                {selectedRow && selectedRow.status !== 'not_configured' ? (
                  <button type="button" className="integration-danger" onClick={() => void disconnect('own_menu')} disabled={saving}>Desativar</button>
                ) : null}
                <button type="button" className="integration-secondary" onClick={openMenu}>Abrir cardápio</button>
                <button type="button" className="integration-primary" onClick={() => void save('own_menu')} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar configuração'}
                </button>
              </div>
            </div>
          ) : null}

          {['ifood','99food','goomer'].includes(selected) ? (
            <div className="integration-form">
              <label>
                <span>Referência da loja no parceiro</span>
                <input
                  value={selectedDraft.merchantReference ?? ''}
                  onChange={event => updateDraft(selected,{ merchantReference:event.target.value.slice(0,120) })}
                  placeholder="ID, código ou referência comercial"
                />
                <small>Não coloque senha, token ou segredo de API neste campo.</small>
              </label>

              <label className="integration-switch-row">
                <span>
                  <strong>Importação automática de pedidos</strong>
                  <small>Preferência que será usada quando a conexão oficial estiver ativa.</small>
                </span>
                <button
                  type="button"
                  className={`integration-switch ${selectedDraft.autoImport ? 'on' : ''}`}
                  onClick={() => updateDraft(selected,{ autoImport:!selectedDraft.autoImport })}
                ><i /></button>
              </label>

              <div className="integration-provider-warning">
                <span className="integration-provider-warning-icon">!</span>
                <div>
                  <strong>Credenciais oficiais necessárias</strong>
                  <p>O painel não armazena tokens secretos no navegador. A conexão real com {selectedProvider.name} será feita no backend quando as credenciais e o acesso oficial do parceiro estiverem disponíveis.</p>
                </div>
              </div>

              <div className="integration-actions">
                {selectedRow && selectedRow.status !== 'not_configured' ? (
                  <button type="button" className="integration-danger" onClick={() => void disconnect(selected)} disabled={saving}>Cancelar solicitação</button>
                ) : null}
                <button type="button" className="integration-primary" onClick={() => void save(selected,'pending')} disabled={saving}>
                  {saving ? 'Salvando...' : 'Solicitar conexão'}
                </button>
              </div>
            </div>
          ) : null}

          {selectedRow?.lastError ? (
            <div className="integration-last-error">
              <strong>Último erro</strong>
              <span>{selectedRow.lastError}</span>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="integrations-flow">
        <div>
          <span className="integration-flow-icon"><Icon name="link" size={18}/></span>
          <strong>Canal de venda</strong>
          <small>WhatsApp, marketplace ou cardápio</small>
        </div>
        <b>→</b>
        <div>
          <span className="integration-flow-icon"><Icon name="box" size={18}/></span>
          <strong>Pedido no painel</strong>
          <small>Pedido pronto para publicar</small>
        </div>
        <b>→</b>
        <div>
          <span className="integration-flow-icon"><Icon name="truck" size={18}/></span>
          <strong>ChamaEntrega</strong>
          <small>Oferta para sua rede de entregadores</small>
        </div>
      </section>

      {message ? (
        <div className={`integrations-toast ${messageType}`} role="status">
          <span>{messageType === 'success' ? '✓' : '!'}</span>{message}
        </div>
      ) : null}
    </div>
  )
}
