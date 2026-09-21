'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAdmin, ACTIVE_STORE_COOKIE } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type AdminActionResult = {
  ok:boolean
  message:string
}

export async function setStoreActiveAdminAction(
  storeId:string,
  isActive:boolean,
):Promise<AdminActionResult> {
  await requireAdmin()
  const normalized = storeId.trim()

  if (!normalized) {
    return { ok:false,message:'Loja inválida.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_store_active',{
    p_store_id:normalized,
    p_is_active:isActive,
  })

  if (error) {
    return {
      ok:false,
      message:error.message === 'ADMIN_REQUIRED'
        ? 'Acesso administrativo necessário.'
        : error.message === 'STORE_NOT_FOUND'
          ? 'Loja não encontrada.'
          : 'Não foi possível alterar o status da loja.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/lojas')
  revalidatePath('/painel')

  return {
    ok:true,
    message:isActive ? 'Loja ativada.' : 'Loja pausada.',
  }
}

export async function selectStoreForAdminAction(
  storeId:string,
):Promise<AdminActionResult> {
  await requireAdmin()
  const normalized = storeId.trim()

  if (!normalized) {
    return { ok:false,message:'Loja inválida.' }
  }

  const supabase = await createClient()
  const { data:store,error } = await supabase
    .from('stores')
    .select('id')
    .eq('id',normalized)
    .maybeSingle()

  if (error || !store) {
    return { ok:false,message:'Loja não encontrada.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_STORE_COOKIE,normalized,{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV === 'production',
    path:'/',
    maxAge:60*60*24*365,
  })

  revalidatePath('/painel','layout')
  return { ok:true,message:'Loja selecionada.' }
}
