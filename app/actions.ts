'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/auth'

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_STORE_COOKIE)

  redirect('/login')
}

export async function setActiveStoreAction(storeId: string) {
  const normalizedStoreId = storeId.trim()

  if (!normalizedStoreId) {
    return { ok:false, message:'Loja inválida.' }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return { ok:false, message:'Sua sessão expirou.' }
  }

  const [{ data: owned }, { data: membership }] = await Promise.all([
    supabase
      .from('stores')
      .select('id')
      .eq('id', normalizedStoreId)
      .eq('owner_id', userId)
      .maybeSingle(),
    supabase
      .from('store_members')
      .select('store_id')
      .eq('store_id', normalizedStoreId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (!owned && !membership) {
    return {
      ok:false,
      message:'Você não possui acesso operacional a essa loja.',
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_STORE_COOKIE, normalizedStoreId, {
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV === 'production',
    path:'/',
    maxAge:60 * 60 * 24 * 365,
  })

  revalidatePath('/painel', 'layout')

  return { ok:true }
}
