import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark">CE</span><span>ChamaEntrega</span></div>
        <div className="eyebrow">Portal da loja</div>
        <h1>Sua operação de entrega em um só lugar.</h1>
        <p className="subtle">Publique pedidos prontos, acompanhe entregadores e controle cada corrida em tempo real.</p>
        <LoginForm />
      </section>
    </main>
  )
}
