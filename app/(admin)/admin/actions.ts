'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type AdminActionResult = {
  ok:boolean
  message:string
}

export type ModerationStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'banned'
  | 'rejected'

const allowedStatuses = new Set<ModerationStatus>([
  'pending',
  'active',
  'suspended',
  'banned',
  'rejected',
])

const statusLabels:Record<ModerationStatus,string> = {
  pending:'Aguardando aprovação',
  active:'Ativo',
  suspended:'Suspenso',
  banned:'Banido',
  rejected:'Rejeitado',
}

function normalizeReason(reason:string|undefined) {
  const value = String(reason ?? '').trim()
  return value ? value.slice(0,500) : null
}

function errorMessage(errorMessage:string,subject:'loja'|'entregador') {
  if (errorMessage === 'ADMIN_REQUIRED') {
    return 'Acesso administrativo necessário.'
  }

  if (errorMessage === 'INVALID_STATUS') {
    return 'Status de moderação inválido.'
  }

  if (
    (subject === 'loja' && errorMessage === 'STORE_NOT_FOUND') ||
    (subject === 'entregador' && errorMessage === 'COURIER_NOT_FOUND')
  ) {
    return subject === 'loja'
      ? 'Loja não encontrada.'
      : 'Entregador não encontrado.'
  }

  return subject === 'loja'
    ? 'Não foi possível alterar o cadastro da loja.'
    : 'Não foi possível alterar o cadastro do entregador.'
}

export async function setStoreModerationStatusAdminAction(
  storeId:string,
  status:ModerationStatus,
  reason?:string,
):Promise<AdminActionResult> {
  await requireAdmin()
  const normalizedId = storeId.trim()

  if (!normalizedId || !allowedStatuses.has(status)) {
    return { ok:false,message:'Dados da loja inválidos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_store_moderation_status',{
    p_store_id:normalizedId,
    p_status:status,
    p_reason:normalizeReason(reason),
  })

  if (error) {
    return {
      ok:false,
      message:errorMessage(error.message,'loja'),
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/lojas')
  revalidatePath(`/admin/lojas/${normalizedId}`)

  return {
    ok:true,
    message:`Loja atualizada para: ${statusLabels[status]}.`,
  }
}

export async function setCourierModerationStatusAdminAction(
  courierId:string,
  status:ModerationStatus,
  reason?:string,
):Promise<AdminActionResult> {
  await requireAdmin()
  const normalizedId = courierId.trim()

  if (!normalizedId || !allowedStatuses.has(status)) {
    return { ok:false,message:'Dados do entregador inválidos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_courier_moderation_status',{
    p_courier_id:normalizedId,
    p_status:status,
    p_reason:normalizeReason(reason),
  })

  if (error) {
    return {
      ok:false,
      message:errorMessage(error.message,'entregador'),
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/entregadores')

  return {
    ok:true,
    message:`Entregador atualizado para: ${statusLabels[status]}.`,
  }
}

/**
 * Compatibilidade com os controles administrativos antigos.
 * No Admin, "ativar/pausar" agora usa o fluxo oficial de moderação.
 */
export async function setStoreActiveAdminAction(
  storeId:string,
  isActive:boolean,
):Promise<AdminActionResult> {
  return setStoreModerationStatusAdminAction(
    storeId,
    isActive ? 'active' : 'suspended',
    isActive ? undefined : 'Operação suspensa pelo administrador.',
  )
}
