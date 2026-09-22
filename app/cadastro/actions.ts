'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SignupState = {
  error?: string
  success?: string
}

function cleanPhone(value:string) {
  return value.replace(/[^0-9()+\-\s]/g,'').trim().slice(0,30)
}

export async function signupStoreAction(
  _:SignupState,
  formData:FormData,
):Promise<SignupState> {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const phone = cleanPhone(String(formData.get('phone') ?? ''))
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')
  const consent = formData.get('consent') === 'accepted'

  if (fullName.length < 3) {
    return { error:'Informe o nome do responsável.' }
  }

  if (!email || !email.includes('@')) {
    return { error:'Informe um e-mail válido.' }
  }

  if (password.length < 10) {
    return { error:'A senha precisa ter pelo menos 10 caracteres.' }
  }

  if (password !== confirmPassword) {
    return { error:'As senhas não conferem.' }
  }

  if (!consent) {
    return { error:'Confirme o consentimento para criar a conta comercial.' }
  }

  const headersList = await headers()
  const host = headersList.get('host')
  const proto = headersList.get('x-forwarded-proto') || 'http'
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/,'')
  const origin =
    configuredSiteUrl ||
    (process.env.NODE_ENV !== 'production' && host
      ? `${proto}://${host}`
      : 'http://localhost:3000')

  const supabase = await createClient()
  const { data,error } = await supabase.auth.signUp({
    email,
    password,
    options:{
      emailRedirectTo:`${origin}/auth/callback?next=/onboarding`,
      data:{
        full_name:fullName,
        phone,
        account_type:'store_owner',
      },
    },
  })

  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { error:'Este e-mail já possui uma conta. Entre pelo login.' }
    }

    return { error:'Não foi possível criar a conta agora. Tente novamente.' }
  }

  if (data.session) {
    redirect('/onboarding')
  }

  return {
    success:'Conta criada. Confira seu e-mail para confirmar o cadastro e continuar a criação da loja.',
  }
}
