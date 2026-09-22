import type { Metadata } from 'next'
import '../private.css'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Entrar no Portal da Loja',
  description: 'Acesse o painel da sua loja no ChamaEntrega.',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (claimsData?.claims?.sub) {
    redirect('/painel')
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand official-login-brand">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            width={420}
            height={140}
            alt="ChamaEntrega — Chamou, Chegou"
            className="official-login-logo"
          />
        </div>
        <div className="eyebrow">Portal da loja</div>
        <h1>Sua operação de entrega em um só lugar.</h1>
        <p className="subtle">Publique pedidos prontos, acompanhe entregadores e controle cada corrida em tempo real.</p>
        <LoginForm />
      </section>
    </main>
  )
}
