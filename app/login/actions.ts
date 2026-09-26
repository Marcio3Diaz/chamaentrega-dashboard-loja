'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOperationalRepository } from '@/lib/data/get-operational-repository'

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

  const repository = getOperationalRepository()

  let stores
  try {
    stores = await repository.listStoresForUser(userId)
  } catch (error) {
    console.error('[loginAction] operational store lookup failed', {
      provider: process.env.DATABASE_PROVIDER ?? 'supabase',
      mysqlSyncFromSupabase: process.env.MYSQL_SYNC_FROM_SUPABASE ?? 'false',
      userId,
      error: error instanceof Error
        ? {
            name:error.name,
            message:error.message,
            stack:error.stack,
          }
        : error,
    })
    await supabase.auth.signOut()
    return { error: 'Não foi possível validar o acesso à sua loja.' }
  }

  if (stores.length) redirect('/painel')

  if (profile.role === 'store_owner') redirect('/onboarding')

  await supabase.auth.signOut()
  return {
    error:'Esta conta não possui uma loja vinculada. O acesso administrativo é separado do Portal da Loja.',
  }
}
