import { createPrivateKey, createSign } from 'node:crypto'

const FIREBASE_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'

let cachedAccessToken = null
let cachedAccessTokenExpiresAt = 0

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

export function decodeFirebaseServiceAccount(encoded) {
  if (!encoded) throw new Error('firebase_service_account_missing')
  const account = JSON.parse(Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8'))
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('firebase_service_account_incomplete')
  }
  return account
}

function createSignedJwt(account) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: FIREBASE_SCOPE,
    aud: account.token_uri || DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(createPrivateKey(account.private_key)).toString('base64url')
  return `${unsigned}.${signature}`
}

export async function getFirebaseAccessToken(account) {
  const now = Date.now()
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken
  }

  const response = await fetch(account.token_uri || DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createSignedJwt(account),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`firebase_oauth_failed:${response.status}:${text.slice(0, 300)}`)
  const body = JSON.parse(text)
  if (!body.access_token) throw new Error('firebase_access_token_missing')
  cachedAccessToken = body.access_token
  cachedAccessTokenExpiresAt = now + Number(body.expires_in || 3600) * 1000
  return cachedAccessToken
}

export function buildNewDeliveryFcmMessage({ token, deviceName = '', delivery, store }) {
  const fee = Number(delivery.deliveryFee || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  const title = 'Nova entrega disponível'
  const body = `${store.name || 'Loja parceira'} • Taxa ${fee}`
  const fullscreen = String(deviceName).includes('fullscreen-delivery-v1')

  return {
    message: {
      token,
      ...(fullscreen ? {} : { notification: { title, body } }),
      data: {
        type: 'new_delivery',
        delivery_id: String(delivery.deliveryId),
        store_id: String(delivery.storeId),
        store_name: String(store.name || 'Loja parceira'),
        store_logo_url: String(store.logoUrl || ''),
        status: 'available',
        route: 'offers',
        event_key: String(delivery.eventKey),
        notification_title: title,
        notification_body: body,
      },
      android: {
        priority: 'HIGH',
        ttl: '300s',
        notification: {
          sound: 'chama_nova_entrega',
          default_vibrate_timings: true,
          notification_priority: 'PRIORITY_MAX',
          visibility: 'PUBLIC',
          tag: `delivery_${delivery.deliveryId}`,
        },
      },
    },
  }
}

export async function sendFcmMessage(account, accessToken, message) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    },
  )
  const text = await response.text()
  if (response.ok) {
    let name = null
    try { name = JSON.parse(text).name || null } catch {}
    return { ok: true, status: response.status, name }
  }
  return { ok: false, status: response.status, error: text.slice(0, 1000) }
}

export function isUnregisteredFcmResult(result) {
  return !result.ok && (
    result.status === 404 ||
    String(result.error || '').includes('UNREGISTERED') ||
    String(result.error || '').includes('registration-token-not-registered')
  )
}

export function isTransientFcmResult(result) {
  return !result.ok && [429, 500, 502, 503, 504].includes(result.status)
}
