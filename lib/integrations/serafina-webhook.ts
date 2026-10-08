import { createHmac } from 'node:crypto'

const WEBHOOK_TIMEOUT_MS = 5_000

export type SerafinaWebhookStatus =
  | 'created'
  | 'searching_driver'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'

export type SerafinaWebhookPayload = {
  external_order_id: string
  delivery_id?: string
  status: SerafinaWebhookStatus
}

function configuredWebhookUrl() {
  const raw = process.env.SERAFINA_WEBHOOK_URL?.trim()
  if (!raw) return null

  const url = new URL(raw)
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && url.protocol !== 'https:') {
    throw new Error('SERAFINA_WEBHOOK_URL deve usar HTTPS em produção.')
  }

  if (!['http:','https:'].includes(url.protocol)) {
    throw new Error('SERAFINA_WEBHOOK_URL usa protocolo inválido.')
  }

  return url.toString()
}

function webhookSecret() {
  const secret = process.env.SERAFINA_WEBHOOK_SECRET?.trim() ?? ''
  if (!secret) return null

  if (process.env.NODE_ENV === 'production' && secret.length < 24) {
    throw new Error('SERAFINA_WEBHOOK_SECRET deve ter 24+ caracteres em produção.')
  }

  return secret
}

export function mapOrderStatusToSerafina(status: string): SerafinaWebhookStatus | null {
  const mapping: Record<string,SerafinaWebhookStatus> = {
    ready:'created',
    seeking_courier:'searching_driver',
    in_route:'on_the_way',
    completed:'delivered',
    cancelled:'cancelled',
  }

  return mapping[status] ?? null
}

export async function sendSerafinaWebhook(input: {
  externalOrderId: string
  deliveryId?: string | null
  status: SerafinaWebhookStatus
  eventId: string
}) {
  const url = configuredWebhookUrl()
  const secret = webhookSecret()

  if (!url || !secret) {
    return { sent:false as const, reason:'not_configured' as const }
  }

  const externalOrderId = input.externalOrderId.trim()
  const eventId = input.eventId.trim()

  if (!externalOrderId || externalOrderId.length > 30) {
    throw new Error('externalOrderId inválido para webhook Serafina.')
  }

  if (!eventId || eventId.length > 128) {
    throw new Error('eventId inválido para webhook Serafina.')
  }

  const payload: SerafinaWebhookPayload = {
    external_order_id:externalOrderId,
    status:input.status,
  }

  const deliveryId = input.deliveryId?.trim()
  if (deliveryId) {
    if (deliveryId.length > 120) {
      throw new Error('deliveryId inválido para webhook Serafina.')
    }
    payload.delivery_id = deliveryId
  }

  const body = JSON.stringify(payload)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256',secret)
    .update(`${timestamp}.${body}`,'utf8')
    .digest('hex')

  const response = await fetch(url,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-chamaentrega-event-id':eventId,
      'x-chamaentrega-timestamp':timestamp,
      'x-chamaentrega-signature':`sha256=${signature}`,
    },
    body,
    cache:'no-store',
    signal:AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    throw new Error(
      `Webhook Serafina respondeu HTTP ${response.status}${responseText ? `: ${responseText.slice(0,200)}` : ''}`,
    )
  }

  return { sent:true as const }
}
