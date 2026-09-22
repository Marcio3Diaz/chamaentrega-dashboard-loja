'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'

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

  if (fullName.length < 3 || fullName.length > 120) {
    return { error:'Informe um nome válido para o responsável.' }
  }

  if (!email || email.length > 254 || !email.includes('@')) {
    return { error:'Informe um e-mail válido.' }
  }

  if (password.length < 10 || password.length > 128) {
    return { error:'A senha deve ter entre 10 e 128 caracteres.' }
  }

  if (confirmPassword.length > 128 || password !== confirmPassword) {
    return { error:'As senhas não conferem.' }
  }

  if (!consent) {
    return { error:'Confirme o consentimento para criar a conta comercial.' }
  }

  const origin = getSiteUrl()
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
    return {
      error:'Não foi possível concluir o cadastro. Confira os dados ou tente entrar caso já possua uma conta.',
    }
  }

  if (data.session) {
    redirect('/onboarding')
  }

  return {
    success:'Conta criada. Confira seu e-mail para confirmar o cadastro e continuar a criação da loja.',
  }
}
