import { ApiSessionError, createApiSession } from './auth-service.mjs'

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export class SupabaseExchangeError extends Error {
  constructor(code, statusCode = 401) {
    super(code)
    this.name = 'SupabaseExchangeError'
    this.statusCode = statusCode
  }
}

async function resolveSubjectRole(pool, userId) {
  const [profileRows] = await pool.execute(
    'SELECT role FROM profiles WHERE id = ? LIMIT 1',
    [userId],
  )
  const profile = Array.isArray(profileRows) ? profileRows[0] : null
  if (!profile) throw new SupabaseExchangeError('profile_not_found', 403)

  if (profile.role === 'admin') return 'admin'
  if (profile.role === 'courier') return 'courier'
  if (profile.role === 'store_owner') return 'store_owner'

  const [memberRows] = await pool.execute(
    `SELECT 1 AS ok
       FROM store_members
      WHERE user_id = ?
        AND status = 'active'
      LIMIT 1`,
    [userId],
  )
  if (memberRows?.[0]) return 'store_member'

  throw new SupabaseExchangeError('unsupported_profile_role', 403)
}

export async function exchangeSupabaseAccessToken(pool, config, accessToken) {
  const token = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (token.length < 32 || token.length > 8192) {
    throw new SupabaseExchangeError('invalid_supabase_access_token')
  }

  const baseUrl = normalizeBaseUrl(config.supabaseAuthUrl)
  const apiKey = String(config.supabaseAuthApiKey || '').trim()
  if (!baseUrl || !apiKey) {
    throw new SupabaseExchangeError('supabase_auth_bridge_not_configured', 503)
  }

  let response
  try {
    response = await fetch(`${baseUrl}/auth/v1/user`, {
      method:'GET',
      headers:{
        Accept:'application/json',
        apikey:apiKey,
        Authorization:`Bearer ${token}`,
      },
      signal:AbortSignal.timeout(8000),
    })
  } catch {
    throw new SupabaseExchangeError('supabase_auth_unreachable', 503)
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new SupabaseExchangeError('invalid_supabase_access_token', 401)
    }
    throw new SupabaseExchangeError('supabase_auth_unavailable', 503)
  }

  const user = await response.json().catch(() => null)
  const userId = typeof user?.id === 'string' ? user.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new SupabaseExchangeError('invalid_supabase_user', 401)
  }

  const subjectRole = await resolveSubjectRole(pool, userId)

  try {
    const session = await createApiSession(
      pool,
      { subjectId:userId, subjectRole },
      config.apiSessionTtlSeconds,
    )
    return {
      ...session,
      exchangedFrom:'supabase',
    }
  } catch (error) {
    if (error instanceof ApiSessionError) throw error
    throw new SupabaseExchangeError('session_exchange_failed', 500)
  }
}
