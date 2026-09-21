'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { error?: string }

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: 'Informe e-mail e senha.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'E-mail ou senha inválidos.' }

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { error: 'Não foi possível validar sua sessão.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (!profile || !['store_owner', 'admin'].includes(profile.role)) {
    await supabase.auth.signOut()
    return { error: 'Esta conta não possui acesso ao painel da loja.' }
  }

  const { data:stores } = await supabase
    .from('stores')
    .select('id')
    .limit(1)

  redirect(stores?.length ? '/' : '/onboarding')
}
