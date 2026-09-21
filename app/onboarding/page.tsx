import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StoreOnboardingForm } from './store-onboarding-form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data:claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    redirect('/login')
  }

  const [{ data:profile },{ data:stores }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name,role')
      .eq('id',userId)
      .maybeSingle(),
    supabase
      .from('stores')
      .select('id')
      .limit(1),
  ])

  if (!profile || !['store_owner','admin'].includes(profile.role)) {
    await supabase.auth.signOut()
    redirect('/login?error=acesso')
  }

  if (stores?.length) {
    redirect('/painel')
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-topbar">
        <img
          src="/brand/chamaentrega-logo-official.webp"
          alt="ChamaEntrega — Chamou, Chegou"
        />
        <div>
          <span>Bem-vindo{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</span>
          <strong>Vamos criar sua primeira loja.</strong>
        </div>
      </header>

      <section className="onboarding-hero">
        <div className="eyebrow">CONFIGURAÇÃO INICIAL</div>
        <h1>Seu ChamaEntrega começa <span>aqui.</span></h1>
        <p>
          Em poucos minutos sua empresa terá um painel próprio, separado das demais lojas,
          pronto para publicar e acompanhar entregas.
        </p>

        <div className="onboarding-progress">
          <span className="active"><b>1</b> Empresa</span>
          <i/>
          <span className="active"><b>2</b> Endereço</span>
          <i/>
          <span><b>3</b> Painel</span>
        </div>
      </section>

      <StoreOnboardingForm />
    </main>
  )
}
