import { WebSocketServer } from 'ws'
import { authenticateApiSession, canAccessRealtimeChannel } from './auth-service.mjs'

function send(ws, message) {
  if (ws.readyState !== 1) return
  ws.send(JSON.stringify(message))
}

function parsePayload(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return {} }
  }
  return value ?? {}
}

export function startRealtimeServer({ server, pool, config }) {
  if (!config.realtimeEnabled) {
    return { stop() {} }
  }

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.realtimeMaxPayloadBytes,
  })
  const clients = new Set()
  let stopped = false
  let polling = false
  let lastEventId = 0
  let purgeTick = 0

  const initializeCursor = async () => {
    const [rows] = await pool.query('SELECT COALESCE(MAX(id),0) AS max_id FROM realtime_events')
    lastEventId = Number(rows?.[0]?.max_id || 0)
  }

  const upgradeHandler = (request, socket, head) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
      if (url.pathname !== '/realtime') {
        socket.destroy()
        return
      }

      const origin = typeof request.headers.origin === 'string'
        ? request.headers.origin
        : null
      if (origin && !config.realtimeAllowedOrigins.includes(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }

      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request)
      })
    } catch {
      socket.destroy()
    }
  }

  server.on('upgrade', upgradeHandler)

  wss.on('connection', ws => {
    const client = {
      ws,
      session: null,
      subscriptions: new Set(),
      authenticated: false,
      alive: true,
    }
    clients.add(client)

    const authTimer = setTimeout(() => {
      if (!client.authenticated) ws.close(4401, 'authentication_required')
    }, 5000)
    authTimer.unref()

    ws.on('pong', () => {
      client.alive = true
    })

    ws.on('message', async raw => {
      let message
      try {
        message = JSON.parse(String(raw))
      } catch {
        return send(ws, { type:'error', error:'invalid_json' })
      }

      try {
        if (message.type === 'auth') {
          const session = await authenticateApiSession(pool, message.token)
          if (!session.scopes.includes('realtime:connect') && !session.scopes.includes('admin:*')) {
            throw new Error('realtime_scope_required')
          }
          client.session = session
          client.authenticated = true
          clearTimeout(authTimer)
          return send(ws, {
            type:'authenticated',
            session:{
              id:session.id,
              subjectId:session.subjectId,
              subjectRole:session.subjectRole,
            },
          })
        }

        if (!client.authenticated || !client.session) {
          return send(ws, { type:'error', error:'authentication_required' })
        }

        if (message.type === 'subscribe') {
          const channel = typeof message.channel === 'string' ? message.channel.trim() : ''
          if (!await canAccessRealtimeChannel(pool, client.session, channel)) {
            return send(ws, { type:'error', error:'channel_access_denied', channel })
          }
          client.subscriptions.add(channel)
          return send(ws, { type:'subscribed', channel })
        }

        if (message.type === 'unsubscribe') {
          const channel = typeof message.channel === 'string' ? message.channel.trim() : ''
          client.subscriptions.delete(channel)
          return send(ws, { type:'unsubscribed', channel })
        }

        if (message.type === 'ping') {
          return send(ws, { type:'pong', timestamp:new Date().toISOString() })
        }

        send(ws, { type:'error', error:'unknown_message_type' })
      } catch (error) {
        send(ws, { type:'error', error:error?.message || 'realtime_error' })
      }
    })

    ws.on('close', () => {
      clearTimeout(authTimer)
      clients.delete(client)
    })

    ws.on('error', () => {
      clients.delete(client)
    })

    send(ws, {
      type:'hello',
      protocol:'chama-realtime-v1',
      authTimeoutMs:5000,
    })
  })

  const broadcastEvent = event => {
    const primary = event.audience_type === 'admin'
      ? 'admin'
      : event.audience_type === 'courier_pool'
        ? 'courier_pool'
        : `${event.audience_type}:${event.audience_id}`

    for (const client of clients) {
      if (!client.authenticated) continue
      const adminSubscribed = client.subscriptions.has('admin')
      const targetSubscribed = client.subscriptions.has(primary)
      if (!adminSubscribed && !targetSubscribed) continue

      send(client.ws, {
        type:'event',
        id:Number(event.id),
        channel:primary,
        eventType:event.event_type,
        payload:parsePayload(event.payload),
        createdAt:event.created_at,
      })
    }
  }

  const poll = async () => {
    if (stopped || polling) return
    polling = true
    try {
      const [rows] = await pool.query(
        `SELECT id, audience_type, audience_id, event_type, payload, created_at
           FROM realtime_events
          WHERE id > ?
            AND expires_at > UTC_TIMESTAMP(6)
          ORDER BY id ASC
          LIMIT ${Number(config.realtimeBatchSize)}`,
        [lastEventId],
      )

      for (const event of Array.isArray(rows) ? rows : []) {
        lastEventId = Math.max(lastEventId, Number(event.id))
        broadcastEvent(event)
      }

      purgeTick += 1
      if (purgeTick >= 120) {
        purgeTick = 0
        void pool.query(
          'DELETE FROM realtime_events WHERE expires_at <= UTC_TIMESTAMP(6) LIMIT 5000',
        ).catch(() => {})
      }
    } catch (error) {
      console.error('[chamaentrega-api] realtime relay error:', error)
    } finally {
      polling = false
    }
  }

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.ws.terminate()
        clients.delete(client)
        continue
      }
      client.alive = false
      try { client.ws.ping() } catch {}
    }
  }, 30_000)
  heartbeat.unref()

  const timer = setInterval(() => void poll(), config.realtimePollMs)
  timer.unref()

  void initializeCursor().then(() => poll()).catch(error => {
    console.error('[chamaentrega-api] realtime cursor initialization failed:', error)
  })

  return {
    stop() {
      stopped = true
      clearInterval(timer)
      clearInterval(heartbeat)
      server.off('upgrade', upgradeHandler)
      for (const client of clients) {
        try { client.ws.close(1001, 'server_shutdown') } catch {}
      }
      clients.clear()
      wss.close()
    },
  }
}
