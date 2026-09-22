'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { error?: string }

export async function loginAction(
  _: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (
    !email
    || !password
    || email.length > 254
    || password.length > 128
  ) {
    return { error: 'E-mail ou senha inválidos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: 'E-mail ou senha inválidos.' }

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    await supabase.auth.signOut()
    return { error: 'Não foi possível validar sua sessão.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    await supabase.auth.signOut()
    return { error: 'Esta conta não possui acesso ao Portal da Loja.' }
  }

  const [{ data: ownedStores }, { data: memberships }] = await Promise.all([
    supabase
      .from('stores')
      .select('id')
      .eq('owner_id', userId)
      .limit(1),
    supabase
      .from('store_members')
      .select('store_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1),
  ])

  const hasStoreAccess = Boolean(ownedStores?.length || memberships?.length)

  if (hasStoreAccess) redirect('/painel')

  if (profile.role === 'store_owner') redirect('/onboarding')

  await supabase.auth.signOut()
  return {
    error:'Esta conta não possui uma loja vinculada. O acesso administrativo é separado do Portal da Loja.',
  }
}
