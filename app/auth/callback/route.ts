import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeNext(value:string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/reset-password'
  }

  return value
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  const fallback = next === '/onboarding'
    ? '/login?error=confirmacao'
    : '/forgot-password?error=link'

  return NextResponse.redirect(new URL(fallback, request.url))
}
