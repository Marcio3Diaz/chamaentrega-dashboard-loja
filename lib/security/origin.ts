function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function isTrustedBrowserOrigin(request: Request) {
  const origin = normalizeOrigin(request.headers.get('origin'))

  // Server-to-server and non-browser requests often omit Origin.
  // For state-changing browser requests we require it in production.
  if (!origin) {
    return process.env.NODE_ENV !== 'production'
  }

  const allowed = new Set<string>()

  const requestOrigin = normalizeOrigin(request.url)
  if (requestOrigin) allowed.add(requestOrigin)

  const configuredSiteOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL)
  if (configuredSiteOrigin) allowed.add(configuredSiteOrigin)

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host')?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()

  if (host) {
    const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    const forwardedOrigin = normalizeOrigin(`${protocol}://${host}`)
    if (forwardedOrigin) allowed.add(forwardedOrigin)
  }

  return allowed.has(origin)
}

export function acceptsJson(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  return contentType.startsWith('application/json')
}

export function bodyWithinLimit(request: Request, maxBytes = 16 * 1024) {
  const raw = request.headers.get('content-length')
  if (!raw) return true

  const length = Number(raw)
  return Number.isFinite(length) && length >= 0 && length <= maxBytes
}
