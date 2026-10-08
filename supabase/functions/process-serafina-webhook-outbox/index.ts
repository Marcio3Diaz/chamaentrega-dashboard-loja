import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

type SupabaseAdmin = SupabaseClient<any, 'public', 'public', any, any>

type OutboxRow = {
  id: string
  event_key: string
  payload: Record<string, unknown>
  attempts: number
}

const FUNCTION_NAME = 'process-serafina-webhook-outbox'
const MAX_BATCH = 25
const MAX_ATTEMPTS = 12
const REQUEST_TIMEOUT_MS = 5_000

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Secret ${name} não configurado.`)
  return value
}

function getSupabaseAdminKey(): string {
  const legacyServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacyServiceRole) return legacyServiceRole

  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim()
  if (secretKeysJson) {
    const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>
    const defaultKey = secretKeys.default ?? Object.values(secretKeys)[0]
    if (defaultKey) return defaultKey
  }

  throw new Error('Chave administrativa do Supabase não disponível.')
}

function timingSafeEqual(received: string, expected: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(received)
  const right = encoder.encode(expected)

  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return bytesToHex(new Uint8Array(signature))
}

function configuredWebhookUrl(): string {
  const raw = getRequiredEnv('SERAFINA_WEBHOOK_URL')
  const url = new URL(raw)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SERAFINA_WEBHOOK_URL usa protocolo inválido.')
  }

  const isRemote = Deno.env.get('DENO_DEPLOYMENT_ID') != null
  if (isRemote && url.protocol !== 'https:') {
    throw new Error('SERAFINA_WEBHOOK_URL deve usar HTTPS no ambiente remoto.')
  }

  return url.toString()
}

function retryDelaySeconds(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 8))
  return Math.min(15 * 60, 5 * (2 ** exponent))
}

async function markDelivered(
  supabase: SupabaseAdmin,
  rowId: string,
) {
  const { error } = await supabase
    .from('serafina_webhook_outbox')
    .update({
      sent_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .is('sent_at', null)

  if (error) {
    throw new Error(`Falha ao confirmar outbox ${rowId}: ${error.message}`)
  }
}

async function markFailed(
  supabase: SupabaseAdmin,
  row: OutboxRow,
  message: string,
) {
  const now = new Date()
  const terminal = row.attempts >= MAX_ATTEMPTS
  const update = terminal
    ? {
        dead_at: now.toISOString(),
        locked_at: null,
        last_error: message.slice(0, 1000),
        updated_at: now.toISOString(),
      }
    : {
        next_attempt_at: new Date(
          now.getTime() + retryDelaySeconds(row.attempts) * 1000,
        ).toISOString(),
        locked_at: null,
        last_error: message.slice(0, 1000),
        updated_at: now.toISOString(),
      }

  const { error } = await supabase
    .from('serafina_webhook_outbox')
    .update(update)
    .eq('id', row.id)
    .is('sent_at', null)

  if (error) {
    console.error(`${FUNCTION_NAME}: falha ao reagendar ${row.id}.`, error.message)
  }
}

async function sendRow(
  row: OutboxRow,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  if (!row.event_key || row.event_key.length > 128) {
    throw new Error('event_key inválido.')
  }

  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    throw new Error('payload inválido.')
  }

  const body = JSON.stringify(row.payload)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = await hmacSha256Hex(
    webhookSecret,
    `${timestamp}.${body}`,
  )

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chamaentrega-event-id': row.event_key,
      'x-chamaentrega-timestamp': timestamp,
      'x-chamaentrega-signature': `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    throw new Error(
      `HTTP ${response.status}`
      + (responseText ? `: ${responseText.slice(0, 300)}` : ''),
    )
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const expectedWorkerSecret = getRequiredEnv('SERAFINA_OUTBOX_WORKER_SECRET')
    const receivedWorkerSecret = request.headers
      .get('x-serafina-outbox-worker-secret')
      ?.trim() ?? ''

    if (!timingSafeEqual(receivedWorkerSecret, expectedWorkerSecret)) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const webhookSecret = getRequiredEnv('SERAFINA_WEBHOOK_SECRET')
    if (webhookSecret.length < 24) {
      throw new Error('SERAFINA_WEBHOOK_SECRET deve ter pelo menos 24 caracteres.')
    }
    const webhookUrl = configuredWebhookUrl()

    const supabase = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getSupabaseAdminKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    )

    const { data, error } = await supabase.rpc(
      'claim_serafina_webhook_outbox',
      { p_limit: MAX_BATCH },
    )

    if (error) {
      throw new Error(`Falha ao reservar outbox: ${error.message}`)
    }

    const rows = (data ?? []) as OutboxRow[]
    let sent = 0
    let failed = 0
    let dead = 0

    for (const row of rows) {
      try {
        await sendRow(row, webhookUrl, webhookSecret)
        await markDelivered(supabase, row.id)
        sent += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await markFailed(supabase, row, message)
        failed += 1
        if (row.attempts >= MAX_ATTEMPTS) dead += 1
        console.warn(`${FUNCTION_NAME}: callback falhou.`, {
          outboxId: row.id,
          eventKey: row.event_key,
          attempts: row.attempts,
          error: message.slice(0, 300),
        })
      }
    }

    return jsonResponse({
      ok: failed === 0,
      claimed: rows.length,
      sent,
      failed,
      dead,
    }, failed === 0 ? 200 : 207)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`${FUNCTION_NAME}: erro não tratado.`, message)
    return jsonResponse({ error: 'processing_failed' }, 500)
  }
})
