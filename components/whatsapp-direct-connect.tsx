'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type IntegrationState = {
  status: 'not_configured' | 'configured' | 'pending' | 'connected' | 'error'
  isEnabled: boolean
  publicConfig: Record<string,unknown>
  lastError: string | null
  lastSyncedAt: string | null
} | null | undefined

type Props = {
  storeId: string
  storeName: string
  integration: IntegrationState
  onNotice: (message:string,type?:'success'|'error') => void
}

type MetaRuntimeConfig = {
  ready: boolean
  appId: string | null
  configId: string | null
  graphApiVersion: string
  featureType: string | null
}

type EmbeddedSession = {
  wabaId: string
  phoneNumberId: string
}

type FacebookLoginResponse = {
  authResponse?: {
    code?: string
  }
  status?: string
}

declare global {
  interface Window {
    FB?: {
      init: (options:{
        appId:string
        cookie?:boolean
        xfbml?:boolean
        version:string
      }) => void
      login: (
        callback:(response:FacebookLoginResponse)=>void,
        options:Record<string,unknown>,
      ) => void
    }
  }
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function loadMetaSdk(appId:string,version:string) {
  return new Promise<void>((resolve,reject) => {
    const start = () => {
      if (!window.FB) {
        reject(new Error('SDK da Meta não foi carregado.'))
        return
      }

      window.FB.init({
        appId,
        cookie:true,
        xfbml:false,
        version,
      })
      resolve()
    }

    if (window.FB) {
      start()
      return
    }

    const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load',start,{ once:true })
      existing.addEventListener('error',() => reject(new Error('Falha ao carregar a Meta.')),{ once:true })
      return
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    script.onload = start
    script.onerror = () => reject(new Error('Falha ao carregar a Meta.'))
    document.body.appendChild(script)
  })
}

function waitForEmbeddedSignup() {
  let cleanup = () => {}

  const promise = new Promise<EmbeddedSession>((resolve,reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('A Meta não retornou os dados do número selecionado.'))
    },90_000)

    const handler = (event:MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return
      }

      let payload: any = event.data
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload) } catch { return }
      }

      if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP') return

      if (payload.event === 'FINISH') {
        const data = payload.data ?? {}
        const wabaId = String(
          data.waba_id ??
          data.whatsapp_business_account_id ??
          '',
        ).trim()
        const phoneNumberId = String(data.phone_number_id ?? '').trim()

        if (!wabaId || !phoneNumberId) {
          cleanup()
          reject(new Error('A Meta concluiu a autorização sem retornar o número.'))
          return
        }

        cleanup()
        resolve({ wabaId,phoneNumberId })
      }

      if (payload.event === 'CANCEL') {
        cleanup()
        reject(new Error('Conexão cancelada.'))
      }

      if (payload.event === 'ERROR') {
        cleanup()
        reject(new Error('A Meta informou um erro durante a conexão.'))
      }
    }

    cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message',handler)
    }

    window.addEventListener('message',handler)
  })

  return { promise,cancel:cleanup }
}

export function WhatsAppDirectConnect({
  storeId,
  storeName,
  integration,
  onNotice,
}:Props) {
  const supabase = useMemo(() => createClient(),[])
  const [runtime,setRuntime] = useState<MetaRuntimeConfig | null>(null)
  const [loadingConfig,setLoadingConfig] = useState(true)
  const [sdkReady,setSdkReady] = useState(false)
  const [connecting,setConnecting] = useState(false)
  const [disconnecting,setDisconnecting] = useState(false)
  const [savingPreference,setSavingPreference] = useState(false)

  const config = integration?.publicConfig ?? {}
  const connected = integration?.status === 'connected' && integration.isEnabled
  const displayPhone = asString(config.phone)
  const verifiedName = asString(config.verified_name) || storeName
  const autoImport = asBoolean(config.auto_import,true)

  useEffect(() => {
    let cancelled = false

    async function prepare() {
      setLoadingConfig(true)

      try {
        const response = await fetch(
          `/api/integrations/whatsapp/config?store_id=${encodeURIComponent(storeId)}`,
          { cache:'no-store' },
        )

        if (!response.ok) throw new Error('Não foi possível preparar a conexão.')

        const data = await response.json() as MetaRuntimeConfig
        if (cancelled) return

        setRuntime(data)

        if (data.ready && data.appId) {
          await loadMetaSdk(data.appId,data.graphApiVersion)
          if (!cancelled) setSdkReady(true)
        }
      } catch {
        if (!cancelled) {
          setRuntime({
            ready:false,
            appId:null,
            configId:null,
            graphApiVersion:'v26.0',
            featureType:null,
          })
        }
      } finally {
        if (!cancelled) setLoadingConfig(false)
      }
    }

    void prepare()

    return () => {
      cancelled = true
    }
  },[storeId])

  function connect() {
    if (!runtime?.ready || !runtime.configId || !window.FB || !sdkReady) {
      onNotice('A conexão do WhatsApp ainda está sendo preparada pela plataforma.','error')
      return
    }

    setConnecting(true)

    const embedded = waitForEmbeddedSignup()

    const extras:Record<string,unknown> = {
      setup:{},
      sessionInfoVersion:'3',
    }

    if (runtime.featureType) {
      extras.featureType = runtime.featureType
    }

    window.FB.login(
      async response => {
        const code = response.authResponse?.code?.trim()

        if (!code) {
          embedded.cancel()
          setConnecting(false)
          onNotice(
            response.status === 'unknown'
              ? 'Conexão cancelada.'
              : 'A Meta não retornou a autorização do WhatsApp.',
            'error',
          )
          return
        }

        try {
          const session = await embedded.promise

          const complete = await fetch('/api/integrations/whatsapp/complete',{
            method:'POST',
            headers:{ 'content-type':'application/json' },
            body:JSON.stringify({
              storeId,
              code,
              wabaId:session.wabaId,
              phoneNumberId:session.phoneNumberId,
            }),
          })

          const result = await complete.json().catch(() => ({})) as {
            connected?:boolean
            message?:string
          }

          if (!complete.ok || !result.connected) {
            throw new Error(result.message || 'Não foi possível concluir a conexão.')
          }

          onNotice('WhatsApp conectado ao ChamaEntrega.')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha na conexão.'
          onNotice(message,'error')
        } finally {
          setConnecting(false)
        }
      },
      {
        config_id:runtime.configId,
        response_type:'code',
        override_default_response_type:true,
        extras,
      },
    )
  }

  async function disconnect() {
    setDisconnecting(true)

    try {
      const response = await fetch('/api/integrations/whatsapp/disconnect',{
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ storeId }),
      })

      if (!response.ok) {
        throw new Error('Não foi possível desconectar o WhatsApp.')
      }

      onNotice('WhatsApp desconectado.')
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : 'Falha ao desconectar.',
        'error',
      )
    } finally {
      setDisconnecting(false)
    }
  }

  async function toggleAutoImport() {
    if (!integration) return

    setSavingPreference(true)

    const { error } = await supabase
      .from('store_integrations')
      .update({
        public_config:{
          ...integration.publicConfig,
          auto_import:!autoImport,
        },
      })
      .eq('store_id',storeId)
      .eq('provider','whatsapp')

    setSavingPreference(false)

    if (error) {
      onNotice('Não foi possível alterar a importação automática.','error')
      return
    }

    onNotice(
      autoImport
        ? 'Importação automática desativada.'
        : 'Importação automática ativada.',
    )
  }

  if (connected) {
    return (
      <div className="whatsapp-direct-panel">
        <div className="whatsapp-connected-card">
          <div className="whatsapp-connected-badge">✓</div>
          <div>
            <span>WHATSAPP CONECTADO</span>
            <strong>{verifiedName}</strong>
            <p>{displayPhone || 'Número conectado pela Meta'}</p>
          </div>
        </div>

        <div className="whatsapp-direct-benefits compact">
          <div><b>✓</b><span>Mensagens recebidas pelo canal oficial</span></div>
          <div><b>✓</b><span>Pedidos aparecem na Central de Pedidos</span></div>
          <div><b>✓</b><span>Conexão vinculada somente a esta loja</span></div>
        </div>

        <label className="integration-switch-row">
          <span>
            <strong>Importar pedidos automaticamente</strong>
            <small>Quando ativo, pedidos identificados no WhatsApp entram automaticamente em Pedidos.</small>
          </span>
          <button
            type="button"
            disabled={savingPreference}
            className={`integration-switch ${autoImport ? 'on' : ''}`}
            onClick={() => void toggleAutoImport()}
          ><i /></button>
        </label>

        {integration?.lastError ? (
          <div className="integration-last-error">
            <strong>Último erro</strong>
            <span>{integration.lastError}</span>
          </div>
        ) : null}

        <div className="whatsapp-direct-actions">
          <button
            type="button"
            className="integration-danger"
            disabled={disconnecting}
            onClick={() => void disconnect()}
          >
            {disconnecting ? 'Desconectando...' : 'Desconectar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="whatsapp-direct-panel">
      <div className="whatsapp-direct-intro">
        <span className="whatsapp-direct-shield">WA</span>
        <div>
          <span>CONEXÃO OFICIAL</span>
          <h3>Conecte seu WhatsApp em poucos cliques</h3>
          <p>
            Você será direcionado para uma janela segura da Meta para escolher sua empresa,
            conta do WhatsApp e número. Nenhuma senha do Facebook passa pelo ChamaEntrega.
          </p>
        </div>
      </div>

      <div className="whatsapp-direct-benefits">
        <div><b>1</b><span>Clique em <strong>Conectar WhatsApp</strong></span></div>
        <div><b>2</b><span>Entre na Meta e escolha o número da loja</span></div>
        <div><b>3</b><span>Os pedidos começam a chegar em <strong>Pedidos</strong></span></div>
      </div>

      {!loadingConfig && !runtime?.ready ? (
        <div className="whatsapp-platform-pending">
          <b>!</b>
          <span>
            <strong>Conexão ainda não liberada</strong>
            <small>O ChamaEntrega está aguardando a ativação da integração oficial da plataforma com a Meta.</small>
          </span>
        </div>
      ) : null}

      <button
        type="button"
        className="whatsapp-connect-button"
        onClick={connect}
        disabled={loadingConfig || !runtime?.ready || !sdkReady || connecting}
      >
        <img src="/integrations/whatsapp.svg" alt="" />
        <span>
          <strong>{connecting ? 'Conectando...' : 'Conectar WhatsApp'}</strong>
          <small>{loadingConfig ? 'Preparando conexão...' : 'Continuar com a Meta'}</small>
        </span>
        <i>→</i>
      </button>

      <div className="whatsapp-direct-security">
        <span>🔒</span>
        <p>
          A autorização acontece diretamente na Meta. O ChamaEntrega armazena somente os
          dados técnicos necessários para receber seus pedidos.
        </p>
      </div>
    </div>
  )
}
