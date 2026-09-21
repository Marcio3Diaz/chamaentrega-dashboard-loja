'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
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

  return {
    ok:true,
    message:isActive ? 'Loja ativada.' : 'Loja pausada.',
  }
}

