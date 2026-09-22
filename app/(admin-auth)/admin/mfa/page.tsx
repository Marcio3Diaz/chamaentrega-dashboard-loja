import '../../../private.css'
import './mfa.css'
import { requireAdminIdentity } from '@/lib/auth'
import { AdminMfaChallenge } from './admin-mfa-challenge'

export const metadata = {
  title:'Verificação em duas etapas | ChamaEntrega',
  robots:{ index:false,follow:false },
}

export default async function AdminMfaPage() {
  const { fullName } = await requireAdminIdentity()

  return (
    <main className="admin-mfa-page">
      <section className="admin-mfa-card">
        <div className="admin-mfa-brand">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            width={235}
            height={78}
            alt="ChamaEntrega"
          />
        </div>

        <div className="admin-mfa-kicker">SEGURANÇA ADMINISTRATIVA</div>
        <h1>Confirme que é você.</h1>
        <p>
          Olá, {fullName}. Digite o código de 6 dígitos do seu aplicativo
          autenticador para abrir a Central ChamaEntrega.
        </p>

        <AdminMfaChallenge />
      </section>
    </main>
  )
}
