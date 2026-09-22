import '../../../../private.css'
import '../mfa.css'
import { requireAdminIdentity } from '@/lib/auth'
import { AdminMfaSetup } from './admin-mfa-setup'

export const metadata = {
  title:'Ativar verificação em duas etapas | ChamaEntrega',
  robots:{ index:false,follow:false },
}

export default async function AdminMfaSetupPage() {
  const { fullName } = await requireAdminIdentity()

  return (
    <main className="admin-mfa-page">
      <section className="admin-mfa-card admin-mfa-setup-card">
        <div className="admin-mfa-brand">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            width={235}
            height={78}
            alt="ChamaEntrega"
          />
        </div>

        <div className="admin-mfa-kicker">PROTEÇÃO OBRIGATÓRIA</div>
        <h1>Ative o autenticador.</h1>
        <p>
          {fullName}, a Central Administrativa exige uma segunda etapa além da senha.
          Escaneie o QR Code com Google Authenticator, Microsoft Authenticator,
          1Password ou outro app compatível com TOTP.
        </p>

        <AdminMfaSetup />
      </section>
    </main>
  )
}
