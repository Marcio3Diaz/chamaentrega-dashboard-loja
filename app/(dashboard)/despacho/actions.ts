'use server'

import { revalidatePath } from 'next/cache'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type DispatchRouteResult = {
  ok: boolean
  message: string
  groupId?: string
}

export async function dispatchRouteAction(
  deliveryIds: string[],
  courierId: string,
): Promise<DispatchRouteResult> {
  const { store } = await requireStore()
  const normalizedIds = Array.from(
    new Set(deliveryIds.map(id => id.trim()).filter(Boolean)),
  ).slice(0,3)
  const normalizedCourierId = courierId.trim()

  if (!normalizedIds.length || normalizedIds.length > 3) {
    return {
      ok:false,
      message:'Selecione de 1 a 3 entregas para despachar.',
    }
  }

  if (!normalizedCourierId) {
    return {
      ok:false,
      message:'Nenhum entregador disponível foi selecionado.',
    }
  }

  const supabase = await createClient()
  const { data,error } = await supabase.rpc('dispatch_route_to_courier',{
    p_store_id:store.id,
    p_courier_id:normalizedCourierId,
    p_delivery_ids:normalizedIds,
  })

  if (error) {
    const translations: Record<string,string> = {
      SELECIONE_DE_1_A_3_ENTREGAS:'Selecione de 1 a 3 entregas.',
      LOJA_NAO_AUTORIZADA:'A loja não tem permissão para despachar esta rota.',
      ENTREGADOR_INDISPONIVEL:'O entregador recomendado ficou indisponível. Recalcule a rota.',
      ENTREGA_INVALIDA_OU_JA_ATRIBUIDA:'Uma das entregas já foi atribuída ou não está mais disponível.',
      SESSAO_EXPIRADA:'Sua sessão expirou. Entre novamente.',
    }

    return {
      ok:false,
      message:translations[error.message] ?? error.message ?? 'Não foi possível despachar a rota.',
    }
  }

  revalidatePath('/despacho')
  revalidatePath('/entregas')
  revalidatePath('/')
  revalidatePath('/mapa')

  return {
    ok:true,
    groupId:String(data ?? ''),
    message:normalizedIds.length === 1
      ? 'Entrega enviada ao app do entregador.'
      : `Rota com ${normalizedIds.length} entregas enviada ao app do entregador.`,
  }
}
