'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STORE_COOKIE } from '@/lib/auth'

export type OnboardingState = {
  error?: string
}

function text(formData:FormData,key:string) {
  return String(formData.get(key) ?? '').trim()
}

function numberValue(formData:FormData,key:string) {
  const raw = text(formData,key).replace(',','.')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export async function createFirstStoreAction(
  _:OnboardingState,
  formData:FormData,
):Promise<OnboardingState> {
  const storeName = text(formData,'store_name')
  const storePhone = text(formData,'store_phone')
  const legalName = text(formData,'legal_name')
  const taxId = text(formData,'tax_id')
  const zipCode = text(formData,'zip_code')
  const street = text(formData,'street')
  const streetNumber = text(formData,'street_number')
  const complement = text(formData,'complement')
  const neighborhood = text(formData,'neighborhood')
  const city = text(formData,'city')
  const state = text(formData,'state').toUpperCase()
  const latitude = numberValue(formData,'latitude')
  const longitude = numberValue(formData,'longitude')
  const resolvedAddress = text(formData,'resolved_address')

  if (storeName.length < 2) {
    return { error:'Informe o nome da loja.' }
  }

  if (!street || !streetNumber || !city || !state) {
    return { error:'Preencha rua, número, cidade e estado.' }
  }

  if (latitude === null || longitude === null) {
    return { error:'Localize o endereço da loja no mapa antes de continuar.' }
  }

  const address = resolvedAddress || [
    street,
    streetNumber,
    complement,
    neighborhood,
    city,
    state,
    zipCode ? `CEP ${zipCode}` : '',
  ].filter(Boolean).join(', ')

  const supabase = await createClient()
  const { data,error } = await supabase.rpc('create_first_store_onboarding',{
    p_store_name:storeName,
    p_store_phone:storePhone || null,
    p_address:address,
    p_latitude:latitude,
    p_longitude:longitude,
    p_zip_code:zipCode || null,
    p_street:street || null,
    p_street_number:streetNumber || null,
    p_complement:complement || null,
    p_neighborhood:neighborhood || null,
    p_city:city || null,
    p_state:state || null,
    p_legal_name:legalName || null,
    p_tax_id:taxId || null,
  })

  if (error) {
    const messages:Record<string,string> = {
      SESSAO_EXPIRADA:'Sua sessão expirou. Entre novamente.',
      CONTA_SEM_PERMISSAO_DE_LOJA:'Esta conta não está habilitada para criar uma loja.',
      NOME_DA_LOJA_OBRIGATORIO:'Informe o nome da loja.',
      ENDERECO_OBRIGATORIO:'Informe o endereço da loja.',
      LOCALIZE_O_ENDERECO:'Localize o endereço antes de continuar.',
      LOJA_JA_EXISTE:'Sua primeira loja já foi criada.',
    }

    return {
      error:messages[error.message] || error.message || 'Não foi possível criar sua loja.',
    }
  }

  const storeId = String(data ?? '')
  if (!storeId) {
    return { error:'A loja foi criada, mas não foi possível abrir o painel.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_STORE_COOKIE,storeId,{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV === 'production',
    path:'/',
    maxAge:60*60*24*365,
  })

  revalidatePath('/painel','layout')
  redirect('/painel')
}
