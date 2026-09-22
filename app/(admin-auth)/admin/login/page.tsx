import type { Metadata } from 'next'
import '../../../private.css'
import { AdminLoginForm } from './admin-login-form'

export const metadata: Metadata = {
  title: 'Central Administrativa',
  description: 'Acesso restrito à administração do ChamaEntrega.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdminLoginPage() {
  return (
    <main className="login-page admin-login-page">
      <section className="login-card admin-login-card">
        <div className="login-brand official-login-brand">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            width={420}
            height={140}
            alt="ChamaEntrega — Chamou, Chegou"
            className="official-login-logo"
          />
        </div>

        <div className="eyebrow">Central administrativa</div>
        <h1>Gestão da plataforma ChamaEntrega.</h1>
        <p className="subtle">
          Acesso restrito à administração da rede, lojas, entregadores,
          corridas e financeiro da plataforma.
        </p>

        <div className="admin-login-separation-note">
          <strong>AMBIENTE INDEPENDENTE</strong>
          <span>Este acesso não faz parte do Portal da Loja.</span>
        </div>

        <AdminLoginForm />
      </section>
    </main>
  )
}
