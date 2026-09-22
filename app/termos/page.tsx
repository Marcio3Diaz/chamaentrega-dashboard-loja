import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import '../legal.css'

export const metadata: Metadata = {
  title:'Termos de Uso',
  description:'Condições gerais para utilização da plataforma ChamaEntrega por lojas e usuários autorizados.',
  alternates:{ canonical:'/termos' },
}

export default function TermsPage(){
  return (
    <main className="ce-legal-page">
      <header className="ce-legal-header">
        <Link href="/" aria-label="Voltar para a página inicial">
          <Image
            src="/brand/chamaentrega-logo-official.webp"
            alt="ChamaEntrega"
            width={176}
            height={59}
            priority
          />
        </Link>
        <nav aria-label="Navegação legal">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/">Voltar ao site</Link>
        </nav>
      </header>

      <article className="ce-legal-wrap">
        <div className="ce-legal-kicker">TERMOS DE USO</div>
        <h1>Regras para uma operação organizada e segura.</h1>
        <p className="ce-legal-intro">
          Estas condições resumem as regras gerais de uso da plataforma ChamaEntrega.
          Regras comerciais específicas de planos, tarifas e integrações podem ser
          apresentadas separadamente no momento da contratação.
        </p>
        <span className="ce-legal-updated">Atualizado em setembro de 2026</span>

        <section className="ce-legal-section">
          <h2>1. Uso da plataforma</h2>
          <p>
            O ChamaEntrega oferece recursos para gestão de entregas, rede de
            entregadores, acompanhamento operacional, comunicação, carteira,
            integrações e funcionalidades relacionadas à logística.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>2. Conta e segurança</h2>
          <p>
            O usuário é responsável por fornecer dados corretos, proteger suas
            credenciais e utilizar a conta somente dentro das permissões atribuídas.
            Contas administrativas estão sujeitas a autenticação em duas etapas.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>3. Responsabilidade da loja</h2>
          <p>
            A loja é responsável pelos pedidos que publica, pelos dados operacionais
            informados, pela seleção de profissionais em sua rede e pelo cumprimento
            das obrigações comerciais, fiscais e regulatórias aplicáveis à sua própria
            atividade.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>4. Entregadores e rede</h2>
          <p>
            Participar de uma rede não implica vínculo exclusivo com uma única loja.
            Cada estabelecimento mantém suas próprias aprovações, e o acesso a ofertas
            depende das regras operacionais e do status do profissional na plataforma.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>5. Planos, carteira e entregas</h2>
          <p>
            A assinatura da plataforma e os valores relacionados à operação de entrega
            são conceitos distintos. Preços, limites, tarifas, créditos e condições
            comerciais aplicáveis devem ser exibidos antes da contratação ou da
            confirmação da operação correspondente.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>6. Uso proibido</h2>
          <p>Não é permitido utilizar a plataforma para:</p>
          <ul>
            <li>fraude, falsidade cadastral ou tentativa de obter acesso indevido;</li>
            <li>interferir na segurança, disponibilidade ou integridade do serviço;</li>
            <li>automatizar abuso de rotas, integrações, pagamentos ou notificações;</li>
            <li>usar dados de terceiros fora da finalidade legítima da operação.</li>
          </ul>
        </section>

        <section className="ce-legal-section">
          <h2>7. Integrações externas</h2>
          <p>
            Serviços de terceiros podem alterar APIs, regras, disponibilidade ou
            condições comerciais. O ChamaEntrega pode precisar adaptar, suspender ou
            atualizar uma integração quando o provedor externo modificar suas regras.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>8. Disponibilidade e evolução</h2>
          <p>
            A plataforma pode receber melhorias, correções de segurança e mudanças
            operacionais. Manutenções necessárias podem causar indisponibilidade
            temporária de determinados recursos.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>9. Privacidade</h2>
          <p>
            O tratamento de dados relacionado ao uso da plataforma é descrito na
            página de Privacidade e Segurança.
          </p>
        </section>

        <div className="ce-legal-note">
          Antes do lançamento comercial, estes termos devem receber os dados formais
          da empresa responsável pela operação, o canal oficial de suporte e as
          condições comerciais definitivas.
        </div>

        <footer className="ce-legal-footer">
          <span>© 2026 ChamaEntrega.</span>
          <div>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/">Página inicial</Link>
          </div>
        </footer>
      </article>
    </main>
  )
}
