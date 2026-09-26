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

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string,string | string[] | undefined>>
}) {
  const params = searchParams ? await searchParams : {}
  const errorParam = typeof params.error === 'string' ? params.error : null

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (claimsData?.claims?.sub && !errorParam) {
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
        {errorParam === 'loja' ? (
          <div className="login-error">
            Não foi possível carregar os dados operacionais da loja. Verifique o servidor local e tente novamente.
          </div>
        ) : null}
        {errorParam === 'acesso' ? (
          <div className="login-error">
            Esta conta não possui acesso ao Portal da Loja.
          </div>
        ) : null}
        <LoginForm />
      </section>
    </main>
  )
}
