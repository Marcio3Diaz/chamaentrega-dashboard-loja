'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/auth'

export type AdminLoginState = { error?: string }

export async function adminLoginAction(
  _: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
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

  if (error) {
    return { error: 'E-mail ou senha inválidos.' }
  }

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

  if (!profile || profile.role !== 'admin') {
    await supabase.auth.signOut()
    return { error: 'Esta conta não possui acesso à Central ChamaEntrega.' }
  }

  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_STORE_COOKIE)

  const { data:assurance,error:assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (assuranceError) {
    await supabase.auth.signOut()
    return { error:'Não foi possível validar a segurança da conta administrativa.' }
  }

  if (assurance?.currentLevel === 'aal2') {
    redirect('/admin')
  }

  const { data:factors,error:factorsError } = await supabase.auth.mfa.listFactors()

  if (factorsError) {
    await supabase.auth.signOut()
    return { error:'Não foi possível carregar a verificação em duas etapas.' }
  }

  const hasVerifiedTotp = factors?.totp?.some(
    factor => factor.status === 'verified',
  )

  redirect(hasVerifiedTotp ? '/admin/mfa' : '/admin/mfa/setup')
}

export async function adminSignOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_STORE_COOKIE)

  redirect('/admin/login')
}
