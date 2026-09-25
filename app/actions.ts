'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/auth'
import { getOperationalRepository } from '@/lib/data/get-operational-repository'

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

  const repository = getOperationalRepository()

  let stores
  try {
    stores = await repository.listStoresForUser(userId)
  } catch {
    return {
      ok:false,
      message:'Não foi possível validar o acesso operacional à loja.',
    }
  }

  if (!stores.some(store => store.id === normalizedStoreId)) {
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
