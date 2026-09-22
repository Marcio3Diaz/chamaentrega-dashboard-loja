import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function supabaseRuntimeInfo() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  if (!configuredUrl) {
    return {
      configured: false,
      host: null,
      projectRef: null,
    }
  }

  try {
    const url = new URL(configuredUrl)
    return {
      configured: true,
      host: url.hostname,
      projectRef: url.hostname.split('.')[0] || null,
    }
  } catch {
    return {
      configured: false,
      host: 'invalid-url',
      projectRef: null,
    }
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'chamaentrega-web',
      timestamp: new Date().toISOString(),
      supabase: supabaseRuntimeInfo(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
