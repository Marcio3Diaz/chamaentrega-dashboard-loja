import Link from 'next/link'
import { SignupStoreForm } from './signup-form'

export default function CadastroPage() {
  return (
    <main className="signup-page">
      <section className="signup-showcase">
        <Link href="/login" className="signup-brand" aria-label="ChamaEntrega">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            alt="ChamaEntrega — Chamou, Chegou"
          />
        </Link>

        <div className="signup-showcase-copy">
          <div className="eyebrow">PARA LOJAS</div>
          <h1>
            Sua loja com uma operação de entregas <span>profissional.</span>
          </h1>
          <p>
            Crie sua conta, configure sua loja e comece a chamar entregadores
            pelo mesmo painel que usamos para desenvolver o projeto piloto.
          </p>

          <div className="signup-benefits">
            <article>
              <b>01</b>
              <span>
                <strong>Crie sua loja</strong>
                Nome, endereço, logo e regras de operação.
              </span>
            </article>
            <article>
              <b>02</b>
              <span>
                <strong>Publique entregas</strong>
                Endereço, taxa automática e despacho inteligente.
              </span>
            </article>
            <article>
              <b>03</b>
              <span>
                <strong>Acompanhe em tempo real</strong>
                Entregadores, mapa, chat, financeiro e histórico.
              </span>
            </article>
          </div>
        </div>

        <div className="signup-pilot-note">
          <i/>
          <span>
            <strong>Plataforma multi-loja</strong>
            A Serafina Hamburgueria é a operação piloto. Cada nova empresa recebe
            seus próprios dados, carteira, pedidos e configurações.
          </span>
        </div>
      </section>

      <section className="signup-panel">
        <div className="signup-panel-inner">
          <div className="eyebrow">COMECE AGORA</div>
          <h2>Criar conta da loja</h2>
          <p className="subtle">
            Primeiro criamos o acesso do responsável. No próximo passo você cadastra
            os dados da empresa e o endereço de retirada.
          </p>

          <SignupStoreForm />
        </div>
      </section>
    </main>
  )
}
