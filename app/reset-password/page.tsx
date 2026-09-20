import { ResetPasswordForm } from './reset-password-form'

export default function ResetPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark">CE</span><span>ChamaEntrega</span></div>
        <div className="eyebrow">Segurança</div>
        <h1>Crie uma nova senha</h1>
        <p className="subtle">Use pelo menos 8 caracteres. Depois você voltará ao login para entrar com a nova senha.</p>
        <ResetPasswordForm />
      </section>
    </main>
  )
}
