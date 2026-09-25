export type MigrationRealtimeState =
  | 'disabled'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'error'
  | 'closed'

export type MigrationRealtimeEvent = {
  id:number
  channel:string
  eventType:string
  payload:Record<string,unknown>
  createdAt:string
}

type BridgeSession = {
  token:string
  realtimeUrl:string
  defaultChannel:string
}

type Options = {
  onState?:(state:MigrationRealtimeState) => void
  onEvent?:(event:MigrationRealtimeEvent) => void
  channel?:string
}

export function isMigrationRealtimeEnabled() {
  return process.env.NEXT_PUBLIC_CHAMA_MIGRATION_REALTIME === 'true'
}

export function connectMigrationRealtime(options:Options = {}) {
  if (typeof window === 'undefined' || !isMigrationRealtimeEnabled()) {
    options.onState?.('disabled')
    return { close() {} }
  }

  let stopped = false
  let socket:WebSocket | null = null
  let retryTimer:number | null = null
  let attempts = 0

  const setState = (state:MigrationRealtimeState) => options.onState?.(state)

  const scheduleReconnect = () => {
    if (stopped) return
    if (retryTimer != null) window.clearTimeout(retryTimer)
    attempts += 1
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5))
    setState('reconnecting')
    retryTimer = window.setTimeout(() => void open(), delay)
  }

  const getBridgeSession = async ():Promise<BridgeSession> => {
    const response = await fetch('/api/migration/session', {
      method:'POST',
      cache:'no-store',
      headers:{ Accept:'application/json' },
    })
    const body = await response.json().catch(() => ({})) as Partial<BridgeSession> & { error?:string }
    if (!response.ok || !body.token || !body.realtimeUrl || !body.defaultChannel) {
      throw new Error(body.error || 'migration_realtime_session_failed')
    }
    return body as BridgeSession
  }

  const open = async () => {
    if (stopped) return
    setState(attempts ? 'reconnecting' : 'connecting')

    try {
      const bridge = await getBridgeSession()
      if (stopped) return
      const channel = options.channel || bridge.defaultChannel

      const ws = new WebSocket(bridge.realtimeUrl)
      socket = ws

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type:'auth', token:bridge.token }))
      })

      ws.addEventListener('message', event => {
        let message:Record<string,unknown>
        try {
          message = JSON.parse(String(event.data)) as Record<string,unknown>
        } catch {
          return
        }

        if (message.type === 'authenticated') {
          ws.send(JSON.stringify({ type:'subscribe', channel }))
          return
        }

        if (message.type === 'subscribed') {
          attempts = 0
          setState('live')
          return
        }

        if (message.type === 'event') {
          options.onEvent?.(message as unknown as MigrationRealtimeEvent)
          return
        }

        if (message.type === 'error') {
          console.warn('[migration-realtime]', message.error)
        }
      })

      ws.addEventListener('close', () => {
        if (socket === ws) socket = null
        if (!stopped) scheduleReconnect()
      })

      ws.addEventListener('error', () => {
        setState('error')
        try { ws.close() } catch {}
      })
    } catch (error) {
      console.warn('[migration-realtime] connection failed', error)
      setState('error')
      scheduleReconnect()
    }
  }

  void open()

  return {
    close() {
      stopped = true
      if (retryTimer != null) window.clearTimeout(retryTimer)
      retryTimer = null
      const current = socket
      socket = null
      if (current && current.readyState <= WebSocket.OPEN) {
        try { current.close(1000, 'client_closed') } catch {}
      }
      setState('closed')
    },
  }
}
