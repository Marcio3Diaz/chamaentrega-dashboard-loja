'use server'

import { revalidatePath } from 'next/cache'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type CourierNetworkReviewResult = {
  ok:boolean
  message:string
}

export async function reviewCourierNetworkRequestAction(
  storeId:string,
  courierId:string,
  decision:'connected'|'rejected',
):Promise<CourierNetworkReviewResult> {
  const access = await requireStore()
  const normalizedStoreId = storeId.trim()
  const normalizedCourierId = courierId.trim()

  if (!access.stores.some(store => store.id === normalizedStoreId)) {
    return { ok:false,message:'Você não tem acesso a esta loja.' }
  }

  if (!normalizedCourierId || !['connected','rejected'].includes(decision)) {
    return { ok:false,message:'Solicitação inválida.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('review_courier_store_network_request',{
    p_store_id:normalizedStoreId,
    p_courier_id:normalizedCourierId,
    p_decision:decision,
    p_note:null,
  })

  if (error) {
    const message = error.message ?? ''

    if (message.includes('REQUEST_ALREADY_REVIEWED')) {
      return { ok:false,message:'Esta solicitação já foi analisada.' }
    }

    if (message.includes('REQUEST_NOT_FOUND')) {
      return { ok:false,message:'Solicitação não encontrada.' }
    }

    return { ok:false,message:'Não foi possível analisar a solicitação agora.' }
  }

  revalidatePath('/entregadores')
  revalidatePath('/painel')
  revalidatePath('/admin/entregadores')

  return {
    ok:true,
    message:decision === 'connected'
      ? 'Entregador aprovado na rede da loja.'
      : 'Solicitação recusada.',
  }
}
