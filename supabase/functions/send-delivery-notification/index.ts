import { createClient } from 'npm:@supabase/supabase-js@2'

type JsonRecord = Record<string, unknown>

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'TEST'
  table: string
  schema: string
  record: JsonRecord | null
  old_record: JsonRecord | null
}

type FirebaseServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

type PushPlan = {
  eventKey: string
  targetCourierIds: string[]
  notificationType: string
  title: string
  body: string
  data: Record<string, string>
  channelId: string
  priority: 'HIGH' | 'NORMAL'
  notificationPriority: 'PRIORITY_MAX' | 'PRIORITY_HIGH' | 'PRIORITY_DEFAULT'
  ttl: string
  tag: string
  sound?: string
}

type PushTokenRow = {
  id: string
  token: string
  courier_id: string
}

type SendResult = {
  tokenId: string
  token: string
  courierId: string
  ok: boolean
  status: number
  fcmMessageName?: string
  error?: string
}

const FUNCTION_NAME = 'send-delivery-notification'
const MAX_WEBHOOK_BYTES = 512 * 1024
const APP_PACKAGE = 'com.marciodiaz.logistica.entregador'
const NEW_DELIVERY_CHANNEL_ID = 'chamaentrega_new_delivery_v1'
const URGENT_CHANNEL_ID = 'entregaplus_urgent_deliveries'
const MESSAGES_CHANNEL_ID = 'entregaplus_messages'
const PAYMENTS_CHANNEL_ID = 'entregaplus_payments'
const GENERAL_CHANNEL_ID = 'entregaplus_updates'
const FIREBASE_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'

let cachedAccessToken: string | null = null
let cachedAccessTokenExpiresAt = 0

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()

  if (!value) {
    throw new Error(`Secret ${name} não configurado.`)
  }

  return value
}

function getSupabaseAdminKey(): string {
  const legacyServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()

  if (legacyServiceRole) {
    return legacyServiceRole
  }

  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim()

  if (secretKeysJson) {
    const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>
    const defaultKey = secretKeys.default ?? Object.values(secretKeys)[0]

    if (defaultKey) {
      return defaultKey
    }
  }

  throw new Error('Chave administrativa do Supabase não disponível.')
}

function timingSafeEqual(received: string, expected: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(received)
  const right = encoder.encode(expected)

  if (left.length !== right.length) {
    return false
  }

  let difference = 0

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }

  return difference === 0
}

function decodeServiceAccount(): FirebaseServiceAccount {
  const encoded = getRequiredEnv('FIREBASE_SERVICE_ACCOUNT_BASE64')
  const normalized = encoded.replace(/\s/g, '')
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const json = new TextDecoder().decode(bytes)
  const account = JSON.parse(json) as FirebaseServiceAccount

  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('Credencial do Firebase incompleta.')
  }

  return account
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input

  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function pemPrivateKeyToBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

  return bytes.buffer
}

async function createSignedJwt(account: FirebaseServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64UrlEncode(JSON.stringify({
    iss: account.client_email,
    scope: FIREBASE_SCOPE,
    aud: account.token_uri ?? DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }))
  const unsignedToken = `${header}.${claims}`

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemPrivateKeyToBuffer(account.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken),
  )

  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function getFirebaseAccessToken(
  account: FirebaseServiceAccount,
): Promise<string> {
  const now = Date.now()

  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken
  }

  const assertion = await createSignedJwt(account)
  const tokenUri = account.token_uri ?? DEFAULT_TOKEN_URI
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(
      `Falha ao gerar token OAuth do Firebase (${response.status}): ${responseText.slice(0, 500)}`,
    )
  }

  const tokenData = JSON.parse(responseText) as {
    access_token?: string
    expires_in?: number
  }

  if (!tokenData.access_token) {
    throw new Error('O Google não retornou um access_token.')
  }

  cachedAccessToken = tokenData.access_token
  cachedAccessTokenExpiresAt = now + (tokenData.expires_in ?? 3600) * 1000

  return tokenData.access_token
}

function textValue(value: unknown): string {
  if (value == null) {
    return ''
  }

  return String(value).trim()
}

function lowerText(value: unknown): string {
  return textValue(value).toLowerCase()
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.substring(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function formatCurrency(value: number | null): string | null {
  if (value == null) {
    return null
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}


function simpleFingerprint(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

function eventVersion(record: JsonRecord): string {
  return textValue(record.updated_at) ||
    textValue(record.created_at) ||
    textValue(record.published_at) ||
    new Date().toISOString()
}

async function resolveStore(
  supabaseAdmin: ReturnType<typeof createClient>,
  storeId: string,
): Promise<{ name: string; logoUrl: string }> {
  if (!storeId) {
    return { name: 'Loja parceira', logoUrl: '' }
  }

  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('name,logo_url')
    .eq('id', storeId)
    .maybeSingle()

  if (error) {
    console.warn(`${FUNCTION_NAME}: falha ao consultar loja ${storeId}.`, error.message)
    return { name: 'Loja parceira', logoUrl: '' }
  }

  return {
    name: textValue(data?.name) || 'Loja parceira',
    logoUrl: textValue(data?.logo_url),
  }
}

async function availableCourierIds(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('couriers')
    .select('id')
    .eq('is_online', true)
    .eq('is_available', true)

  if (error) {
    throw new Error(`Falha ao consultar entregadores disponíveis: ${error.message}`)
  }

  return uniqueNonEmpty((data ?? []).map((row) => textValue(row.id)))
}

function statusLabel(status: string): string {
  switch (status) {
    case 'sent':
      return 'A loja informou que enviou o Pix.'
    case 'received':
      return 'O recebimento foi confirmado.'
    case 'disputed':
      return 'O pagamento entrou em análise.'
    case 'pending':
    default:
      return 'O pagamento foi registrado na sua Carteira.'
  }
}

async function buildDeliveryPlan(
  payload: WebhookPayload,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<PushPlan | null> {
  if (payload.type !== 'INSERT' && payload.type !== 'UPDATE') {
    return null
  }

  const record = payload.record

  if (!record) {
    return null
  }

  const deliveryId = textValue(record.id)
  const newStatus = lowerText(record.status)
  const oldStatus = lowerText(payload.old_record?.status)

  if (!deliveryId) {
    return null
  }

  const newPublishedAt = textValue(record.published_at)
  const oldPublishedAt = textValue(payload.old_record?.published_at)
  const becameAvailable = newStatus === 'available' && oldStatus !== 'available'
  const republishedAvailable = newStatus === 'available' && oldStatus === 'available' && Boolean(newPublishedAt) && newPublishedAt !== oldPublishedAt

  if (becameAvailable || republishedAvailable) {
    const targetCourierId = textValue(record.target_courier_id)
    const courierIds = targetCourierId ? [targetCourierId] : await availableCourierIds(supabaseAdmin)

    if (courierIds.length === 0) {
      return null
    }

    const storeId = textValue(record.store_id)
    const store = await resolveStore(supabaseAdmin, storeId)
    const amount = formatCurrency(numberValue(
      record.delivery_fee ?? record.courier_fee ?? record.fee,
    ))
    const body = amount
      ? `${store.name} • Taxa ${amount}`
      : `${store.name} publicou uma nova entrega.`

    return {
      eventKey: `delivery_available:${deliveryId}:${eventVersion(record)}`,
      targetCourierIds: courierIds,
      notificationType: 'new_delivery',
      title: 'Nova entrega disponível',
      body,
      data: {
        type: 'new_delivery',
        delivery_id: deliveryId,
        store_id: storeId,
        store_name: store.name,
        store_logo_url: store.logoUrl,
        status: newStatus,
        route: 'offers',
      },
      // Sem channel_id explícito: o Android usa o canal padrão declarado
      // pelo APK instalado. Assim versões anteriores recebem a notificação
      // pelo canal urgente e versões novas usam o canal exclusivo com som.
      channelId: '',
      priority: 'HIGH',
      notificationPriority: 'PRIORITY_MAX',
      ttl: '300s',
      tag: `delivery_${deliveryId}`,
      sound: 'chama_nova_entrega',
    }
  }

  const cancelledStatuses = new Set(['cancelled', 'canceled'])

  if (cancelledStatuses.has(newStatus) && !cancelledStatuses.has(oldStatus)) {
    const courierId = textValue(record.assigned_courier_id) ||
      textValue(payload.old_record?.assigned_courier_id)

    if (!courierId) {
      return null
    }

    const storeId = textValue(record.store_id) || textValue(payload.old_record?.store_id)
    const store = await resolveStore(supabaseAdmin, storeId)

    return {
      eventKey: `delivery_cancelled:${deliveryId}:${eventVersion(record)}`,
      targetCourierIds: [courierId],
      notificationType: 'delivery_cancelled',
      title: 'Entrega cancelada',
      body: `${store.name} cancelou a entrega. Abra o app para conferir.`,
      data: {
        type: 'delivery_cancelled',
        delivery_id: deliveryId,
        store_name: store.name,
        route: 'home',
      },
      channelId: URGENT_CHANNEL_ID,
      priority: 'HIGH',
      notificationPriority: 'PRIORITY_MAX',
      ttl: '3600s',
      tag: `delivery_cancelled_${deliveryId}`,
    }
  }

  return null
}

async function buildChatPlan(
  payload: WebhookPayload,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<PushPlan | null> {
  if (payload.type !== 'INSERT' || !payload.record) {
    return null
  }

  const record = payload.record
  const senderRole = lowerText(record.sender_role)

  if (senderRole === 'courier') {
    return null
  }

  const messageId = textValue(record.id)
  const deliveryId = textValue(record.delivery_id)
  const bodyText = textValue(record.body)

  if (!messageId || !deliveryId || !bodyText) {
    return null
  }

  const { data: delivery, error } = await supabaseAdmin
    .from('deliveries')
    .select('assigned_courier_id,store_id')
    .eq('id', deliveryId)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao consultar entrega do chat: ${error.message}`)
  }

  const courierId = textValue(delivery?.assigned_courier_id)

  if (!courierId) {
    return null
  }

  const store = await resolveStore(supabaseAdmin, textValue(delivery?.store_id))

  return {
    eventKey: `chat_message:${messageId}`,
    targetCourierIds: [courierId],
    notificationType: 'chat_message',
    title: senderRole === 'admin' ? 'Mensagem do suporte' : store.name,
    body: truncate(bodyText, 160),
    data: {
      type: 'chat_message',
      message_id: messageId,
      delivery_id: deliveryId,
      store_name: store.name,
      store_logo_url: store.logoUrl,
      route: 'chat',
    },
    channelId: MESSAGES_CHANNEL_ID,
    priority: 'HIGH',
    notificationPriority: 'PRIORITY_HIGH',
    ttl: '86400s',
    tag: `chat_${deliveryId}`,
  }
}

function buildSupportPlan(payload: WebhookPayload): PushPlan | null {
  if (payload.type !== 'UPDATE' || !payload.record) {
    return null
  }

  const record = payload.record
  const oldRecord = payload.old_record ?? {}
  const ticketId = textValue(record.id)
  const courierId = textValue(record.courier_id)
  const response = textValue(record.support_response)
  const oldResponse = textValue(oldRecord.support_response)
  const status = lowerText(record.status)
  const oldStatus = lowerText(oldRecord.status)
  const responseChanged = Boolean(response) && response !== oldResponse
  const statusChanged = status !== oldStatus &&
    ['in_progress', 'waiting_courier', 'resolved'].includes(status)

  if (!ticketId || !courierId || (!responseChanged && !statusChanged)) {
    return null
  }

  const subject = textValue(record.subject) || 'Seu chamado foi atualizado'
  const body = responseChanged
    ? truncate(response, 170)
    : status === 'resolved'
    ? `O chamado “${truncate(subject, 80)}” foi resolvido.`
    : `O chamado “${truncate(subject, 80)}” teve o status atualizado.`

  return {
    eventKey: `support_reply:${ticketId}:${eventVersion(record)}:${status}:${simpleFingerprint(response)}`,
    targetCourierIds: [courierId],
    notificationType: 'support_reply',
    title: responseChanged ? 'Nova resposta do suporte' : 'Chamado atualizado',
    body,
    data: {
      type: 'support_reply',
      ticket_id: ticketId,
      status,
      route: 'support',
    },
    channelId: MESSAGES_CHANNEL_ID,
    priority: 'HIGH',
    notificationPriority: 'PRIORITY_HIGH',
    ttl: '604800s',
    tag: `support_${ticketId}`,
  }
}

function buildPaymentPlan(payload: WebhookPayload): PushPlan | null {
  if ((payload.type !== 'INSERT' && payload.type !== 'UPDATE') || !payload.record) {
    return null
  }

  const record = payload.record
  const paymentId = textValue(record.id)
  const courierId = textValue(record.courier_id)
  const status = lowerText(record.status) || 'pending'
  const oldStatus = lowerText(payload.old_record?.status)

  if (!paymentId || !courierId) {
    return null
  }

  if (payload.type === 'UPDATE' && status === oldStatus) {
    return null
  }

  const amount = formatCurrency(numberValue(record.amount))
  const body = amount
    ? `${amount} • ${statusLabel(status)}`
    : statusLabel(status)

  return {
    eventKey: `payment_update:${paymentId}:${status}:${eventVersion(record)}`,
    targetCourierIds: [courierId],
    notificationType: 'payment_update',
    title: status === 'sent'
      ? 'Loja informou o pagamento'
      : status === 'received'
      ? 'Pagamento recebido'
      : status === 'disputed'
      ? 'Pagamento em análise'
      : 'Pagamento registrado',
    body,
    data: {
      type: 'payment_update',
      payment_id: paymentId,
      delivery_id: textValue(record.delivery_id),
      status,
      route: 'wallet',
    },
    channelId: PAYMENTS_CHANNEL_ID,
    priority: 'HIGH',
    notificationPriority: 'PRIORITY_HIGH',
    ttl: '604800s',
    tag: `payment_${paymentId}`,
  }
}

function buildTestPlan(payload: WebhookPayload): PushPlan | null {
  if (payload.type !== 'TEST' && payload.table !== 'courier_push_test') {
    return null
  }

  const record = payload.record ?? {}
  const courierId = textValue(record.courier_id)

  if (!courierId) {
    throw new Error('O teste precisa informar record.courier_id.')
  }

  const notificationType = lowerText(record.notification_type) || 'test'
  const route = lowerText(record.route) || 'home'

  return {
    eventKey: textValue(record.event_key) || `test:${courierId}:${crypto.randomUUID()}`,
    targetCourierIds: [courierId],
    notificationType,
    title: textValue(record.title) || 'Teste de notificação Push V2',
    body: textValue(record.body) || 'A notificação chegou corretamente ao aparelho.',
    data: {
      type: notificationType,
      delivery_id: textValue(record.delivery_id),
      ticket_id: textValue(record.ticket_id),
      payment_id: textValue(record.payment_id),
      route,
    },
    channelId: notificationType === 'payment_update'
      ? PAYMENTS_CHANNEL_ID
      : notificationType === 'chat_message' || notificationType === 'support_reply'
      ? MESSAGES_CHANNEL_ID
      : notificationType === 'new_delivery' || notificationType === 'delivery_cancelled'
      ? URGENT_CHANNEL_ID
      : GENERAL_CHANNEL_ID,
    priority: 'HIGH',
    notificationPriority: 'PRIORITY_HIGH',
    ttl: '3600s',
    tag: `test_${courierId}`,
  }
}

async function buildPushPlan(
  payload: WebhookPayload,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<PushPlan | null> {
  const testPlan = buildTestPlan(payload)

  if (testPlan) {
    return testPlan
  }

  if (payload.schema !== 'public') {
    return null
  }

  switch (payload.table) {
    case 'deliveries':
      return await buildDeliveryPlan(payload, supabaseAdmin)
    case 'delivery_chat_messages':
      return await buildChatPlan(payload, supabaseAdmin)
    case 'courier_support_tickets':
      return buildSupportPlan(payload)
    case 'delivery_payments':
      return buildPaymentPlan(payload)
    default:
      return null
  }
}

function normalizeData(data: Record<string, string>, eventKey: string): Record<string, string> {
  const normalized: Record<string, string> = { event_key: eventKey }

  for (const [key, value] of Object.entries(data)) {
    normalized[key] = value ?? ''
  }

  return normalized
}

async function sendToToken(
  tokenRow: PushTokenRow,
  accessToken: string,
  firebaseProjectId: string,
  plan: PushPlan,
): Promise<SendResult> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebaseProjectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        message: {
          token: tokenRow.token,
          notification: {
            title: plan.title,
            body: plan.body,
          },
          data: normalizeData(plan.data, plan.eventKey),
          android: {
            priority: plan.priority,
            ttl: plan.ttl,
            notification: {
              ...(plan.channelId ? { channel_id: plan.channelId } : {}),
              ...(plan.sound
                ? { sound: plan.sound }
                : { default_sound: true }),
              default_vibrate_timings: true,
              notification_priority: plan.notificationPriority,
              visibility: 'PUBLIC',
              tag: plan.tag,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )

  const responseText = await response.text()

  if (response.ok) {
    let fcmMessageName: string | undefined

    try {
      const parsed = JSON.parse(responseText) as { name?: string }
      fcmMessageName = parsed.name
    } catch (_) {
      // A resposta bem-sucedida pode ser registrada mesmo sem JSON legível.
    }

    return {
      tokenId: tokenRow.id,
      token: tokenRow.token,
      courierId: tokenRow.courier_id,
      ok: true,
      status: response.status,
      fcmMessageName,
    }
  }

  return {
    tokenId: tokenRow.id,
    token: tokenRow.token,
    courierId: tokenRow.courier_id,
    ok: false,
    status: response.status,
    error: responseText,
  }
}

function isTransientFailure(result: SendResult): boolean {
  return !result.ok && [429, 500, 502, 503, 504].includes(result.status)
}

async function sendWithRetry(
  tokenRow: PushTokenRow,
  accessToken: string,
  firebaseProjectId: string,
  plan: PushPlan,
): Promise<SendResult> {
  let result = await sendToToken(tokenRow, accessToken, firebaseProjectId, plan)

  if (!isTransientFailure(result)) {
    return result
  }

  await new Promise((resolve) => setTimeout(resolve, 700))
  result = await sendToToken(tokenRow, accessToken, firebaseProjectId, plan)

  return result
}

function isUnregisteredToken(result: SendResult): boolean {
  if (result.ok) {
    return false
  }

  const error = result.error ?? ''

  return result.status === 404 ||
    error.includes('UNREGISTERED') ||
    error.includes('registration-token-not-registered')
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405)
  }

  try {
    const expectedSecret = getRequiredEnv('DELIVERY_WEBHOOK_SECRET')
    const receivedSecret = request.headers
      .get('x-delivery-webhook-secret')
      ?.trim() ?? ''

    if (!timingSafeEqual(receivedSecret, expectedSecret)) {
      return jsonResponse({ error: 'Não autorizado.' }, 401)
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
      return jsonResponse({ error: 'Payload muito grande.' }, 413)
    }

    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
      return jsonResponse({ error: 'Payload muito grande.' }, 413)
    }

    let payload: WebhookPayload
    try {
      payload = JSON.parse(rawBody) as WebhookPayload
    } catch {
      return jsonResponse({ error: 'JSON inválido.' }, 400)
    }

    const supabaseAdmin = createClient(
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

    const plan = await buildPushPlan(payload, supabaseAdmin)

    if (!plan || plan.targetCourierIds.length === 0) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: 'O evento não exige notificação ou não possui destinatário.',
        table: payload.table,
        event_type: payload.type,
      })
    }

    const { data: tokenRowsData, error: tokenError } = await supabaseAdmin
      .from('courier_push_tokens')
      .select('id,token,courier_id')
      .eq('is_active', true)
      .eq('app_package', APP_PACKAGE)
      .in('courier_id', uniqueNonEmpty(plan.targetCourierIds))

    if (tokenError) {
      throw new Error(`Falha ao consultar tokens: ${tokenError.message}`)
    }

    const tokenRows = (tokenRowsData ?? [])
      .map((row) => ({
        id: textValue(row.id),
        token: textValue(row.token),
        courier_id: textValue(row.courier_id),
      }))
      .filter((row) => row.id && row.token.length >= 20 && row.courier_id) as PushTokenRow[]

    if (tokenRows.length === 0) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: 'Nenhum token FCM ativo foi encontrado para os destinatários.',
        event_key: plan.eventKey,
        target_couriers: plan.targetCourierIds.length,
      })
    }

    const tokenIds = tokenRows.map((row) => row.id)
    const { data: dispatchedRows, error: dispatchQueryError } = await supabaseAdmin
      .from('courier_push_dispatches')
      .select('token_id')
      .eq('event_key', plan.eventKey)
      .in('token_id', tokenIds)

    if (dispatchQueryError) {
      throw new Error(`Falha ao consultar deduplicação: ${dispatchQueryError.message}`)
    }

    const alreadyDispatched = new Set(
      (dispatchedRows ?? []).map((row) => textValue(row.token_id)),
    )
    const pendingTokens = tokenRows.filter((row) => !alreadyDispatched.has(row.id))

    if (pendingTokens.length === 0) {
      return jsonResponse({
        ok: true,
        skipped: true,
        duplicate: true,
        reason: 'Este evento já foi enviado para todos os tokens ativos.',
        event_key: plan.eventKey,
      })
    }

    const serviceAccount = decodeServiceAccount()
    const accessToken = await getFirebaseAccessToken(serviceAccount)
    const results = await Promise.all(
      pendingTokens.map((tokenRow) => sendWithRetry(
        tokenRow,
        accessToken,
        serviceAccount.project_id,
        plan,
      )),
    )

    const successfulResults = results.filter((result) => result.ok)
    const invalidResults = results.filter(isUnregisteredToken)

    if (successfulResults.length > 0) {
      const dispatchRows = successfulResults.map((result) => ({
        event_key: plan.eventKey,
        token_id: result.tokenId,
        courier_id: result.courierId,
        notification_type: plan.notificationType,
        fcm_message_name: result.fcmMessageName ?? null,
        sent_at: new Date().toISOString(),
      }))

      const { error: dispatchInsertError } = await supabaseAdmin
        .from('courier_push_dispatches')
        .upsert(dispatchRows, { onConflict: 'event_key,token_id' })

      if (dispatchInsertError) {
        console.warn(
          `${FUNCTION_NAME}: notificações enviadas, mas o registro de deduplicação falhou.`,
          dispatchInsertError.message,
        )
      }
    }

    if (invalidResults.length > 0) {
      const invalidTokenIds = invalidResults.map((result) => result.tokenId)
      const { error: deactivateError } = await supabaseAdmin
        .from('courier_push_tokens')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .in('id', invalidTokenIds)

      if (deactivateError) {
        console.warn(
          `${FUNCTION_NAME}: falha ao desativar tokens inválidos.`,
          deactivateError.message,
        )
      }
    }

    const failed = results.length - successfulResults.length

    for (const result of results.filter((item) => !item.ok)) {
      console.error(
        `${FUNCTION_NAME}: FCM recusou token ${result.tokenId} (${result.status}).`,
        (result.error ?? '').slice(0, 500),
      )
    }

    return jsonResponse({
      ok: failed === 0,
      skipped: false,
      event_key: plan.eventKey,
      notification_type: plan.notificationType,
      target_couriers: plan.targetCourierIds.length,
      tokens_found: tokenRows.length,
      tokens_already_sent: alreadyDispatched.size,
      attempted: pendingTokens.length,
      sent: successfulResults.length,
      failed,
      deactivated: invalidResults.length,
    }, failed === 0 ? 200 : 207)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`${FUNCTION_NAME}: erro não tratado.`, message)

    return jsonResponse({ error: 'processing_failed' }, 500)
  }
})
