import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import '../legal.css'

export const metadata: Metadata = {
  title:'Privacidade e Segurança',
  description:'Entenda como o ChamaEntrega trata dados e quais medidas de segurança fazem parte da plataforma.',
  alternates:{ canonical:'/privacidade' },
}

export default function PrivacyPage(){
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
          <Link href="/termos">Termos de uso</Link>
          <Link href="/">Voltar ao site</Link>
        </nav>
      </header>

      <article className="ce-legal-wrap">
        <div className="ce-legal-kicker">PRIVACIDADE E SEGURANÇA</div>
        <h1>Dados protegidos fazem parte da operação.</h1>
        <p className="ce-legal-intro">
          Esta página resume as categorias de dados utilizadas pelo ChamaEntrega,
          suas finalidades e as principais medidas técnicas adotadas para reduzir
          riscos de acesso indevido, fraude e exposição de informações.
        </p>
        <span className="ce-legal-updated">Atualizado em setembro de 2026</span>

        <section className="ce-legal-section">
          <h2>1. Dados tratados pela plataforma</h2>
          <p>Conforme o recurso utilizado, o ChamaEntrega pode tratar:</p>
          <ul>
            <li>dados de conta, como nome, e-mail e telefone;</li>
            <li>dados cadastrais e operacionais de lojas;</li>
            <li>dados de entregadores, incluindo cadastro e documentos de verificação;</li>
            <li>informações de pedidos, entregas, rotas, localização e status operacional;</li>
            <li>mensagens de chat, avaliações, ocorrências e registros de suporte;</li>
            <li>informações de carteira, recargas e referências de transações;</li>
            <li>dados necessários às integrações que a própria loja decidir conectar.</li>
          </ul>
        </section>

        <section className="ce-legal-section">
          <h2>2. Para que os dados são usados</h2>
          <p>
            Os dados são utilizados para autenticar usuários, organizar a operação
            logística, conectar lojas e entregadores, acompanhar entregas, registrar
            movimentações financeiras, prevenir fraude, prestar suporte e manter a
            segurança e a integridade da plataforma.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>3. Acesso e separação de dados</h2>
          <p>
            A plataforma aplica controles de autorização para separar operações de
            lojas, entregadores e administradores. O banco utiliza Row Level Security
            (RLS), e rotinas privilegiadas fazem validações de identidade e permissão
            antes de executar ações sensíveis.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>4. Credenciais e informações sensíveis</h2>
          <p>
            Segredos de integrações não devem ser expostos ao navegador. Credenciais
            sensíveis do WhatsApp são armazenadas em cofre de segredos no backend, e
            áreas administrativas utilizam autenticação em duas etapas.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>5. Localização</h2>
          <p>
            Dados de localização podem ser utilizados quando necessários para recursos
            de entrega, acompanhamento de rota, confirmação de etapas e exibição de
            entregadores. O acesso depende do contexto da operação e das permissões
            aplicáveis ao usuário.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>6. Integrações e terceiros</h2>
          <p>
            Recursos conectados a serviços externos podem exigir o envio de dados
            estritamente necessários ao funcionamento da integração. Cada integração
            está sujeita também às políticas e condições do respectivo provedor.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>7. Retenção e exclusão</h2>
          <p>
            Os dados são mantidos pelo período necessário às finalidades operacionais,
            de segurança, prevenção de fraude e cumprimento de obrigações aplicáveis.
            Regras específicas de retenção poderão variar conforme o tipo de registro.
          </p>
        </section>

        <section className="ce-legal-section">
          <h2>8. Direitos de privacidade</h2>
          <p>
            Usuários podem solicitar informações sobre seus dados e exercer os direitos
            aplicáveis previstos na legislação de proteção de dados. O canal oficial
            de privacidade será informado junto aos dados comerciais definitivos do
            ChamaEntrega antes do lançamento público.
          </p>
        </section>

        <div className="ce-legal-note">
          Esta página descreve as práticas técnicas atuais do projeto. Antes do
          lançamento comercial, os dados formais do responsável pela operação e o
          canal oficial de privacidade devem ser incluídos.
        </div>

        <footer className="ce-legal-footer">
          <span>© 2026 ChamaEntrega.</span>
          <div>
            <Link href="/termos">Termos</Link>
            <Link href="/">Página inicial</Link>
          </div>
        </footer>
      </article>
    </main>
  )
}
