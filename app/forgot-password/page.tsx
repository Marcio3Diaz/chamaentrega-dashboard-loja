import type { Metadata } from 'next'
import '../private.css'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = {
  title: 'Recuperar senha',
  description: 'Solicite um link seguro para recuperar o acesso ao ChamaEntrega.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function ForgotPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark">CE</span><span>ChamaEntrega</span></div>
        <div className="eyebrow">Recuperar acesso</div>
        <h1>Esqueceu a senha?</h1>
        <p className="subtle">Informe o e-mail da loja. Você receberá um link seguro para cadastrar uma nova senha.</p>
        <ForgotPasswordForm />
      </section>
    </main>
  )
}
