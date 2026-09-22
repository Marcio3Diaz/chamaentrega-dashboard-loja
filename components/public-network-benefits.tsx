import { Icon } from '@/components/icon'

type Benefit = {
  code: string
  title: string
  text: string
  icon: string
  detail: string
}

const benefits: Benefit[] = [
  {
    code:'LO',
    title:'Loja organizada',
    text:'Mais visibilidade sobre pedidos, entregadores e andamento das corridas.',
    icon:'store',
    detail:'Centralize a operação em um único painel e acompanhe pedidos, corridas, entregadores e etapas da entrega com mais clareza. A proposta é reduzir improviso no dia a dia e dar à loja uma visão mais organizada da própria logística.',
  },
  {
    code:'EP',
    title:'Entregador parceiro',
    text:'Mais oportunidades de receber ofertas de diferentes redes próximas.',
    icon:'users',
    detail:'O entregador pode participar de diferentes redes aprovadas na região, aumentando as oportunidades sem precisar ficar vinculado a um único estabelecimento. Para a loja, isso significa acesso a uma base mais flexível de profissionais.',
  },
  {
    code:'RR',
    title:'Rede regional',
    text:'Restaurantes vizinhos ajudam a ampliar a base de entregadores da região.',
    icon:'route',
    detail:'Quando lojas próximas também convidam bons profissionais, a região passa a formar uma base compartilhada mais forte. Cada estabelecimento mantém suas próprias aprovações, mas todos se beneficiam de uma maior circulação de entregadores.',
  },
  {
    code:'OP',
    title:'Operação própria',
    text:'A loja ganha uma alternativa para estruturar sua própria logística de entrega.',
    icon:'lightning',
    detail:'O ChamaEntrega ajuda a loja a construir uma alternativa à dependência exclusiva dos marketplaces. A transição pode ser gradual: você mantém os canais atuais, fortalece sua rede e desenvolve sua operação própria no ritmo do negócio.',
  },
]

export function PublicNetworkBenefits(){
  return (
    <>
      <div className="ce-testimonials-grid ce-network-benefits-grid">
        {benefits.map((benefit,index) => {
          const modalId = `ce-benefit-modal-${benefit.code.toLowerCase()}`
          const titleId = `${modalId}-title`

          return (
            <article key={benefit.code} className="ce-network-benefit-card">
              <button
                type="button"
                className="ce-network-benefit-button"
                popoverTarget={modalId}
                aria-haspopup="dialog"
              >
                <span className="ce-network-benefit-index">0{index + 1}</span>

                <div className="ce-network-benefit-icon">
                  <Icon name={benefit.icon} size={27}/>
                </div>

                <div className="ce-network-benefit-copy">
                  <strong>{benefit.title}</strong>
                  <p>{benefit.text}</p>
                  <span className="ce-network-benefit-more">
                    Entender benefício <Icon name="arrow" size={14}/>
                  </span>
                </div>
              </button>

              <section
                id={modalId}
                popover="auto"
                className="ce-benefit-modal"
                role="dialog"
                aria-labelledby={titleId}
              >
                <button
                  type="button"
                  className="ce-benefit-modal-close"
                  popoverTarget={modalId}
                  popoverTargetAction="hide"
                  aria-label="Fechar"
                >
                  ×
                </button>

                <div className="ce-benefit-modal-icon">
                  <Icon name={benefit.icon} size={30}/>
                </div>
                <span className="ce-benefit-modal-kicker">BENEFÍCIO DA REDE</span>
                <h3 id={titleId}>{benefit.title}</h3>
                <p>{benefit.detail}</p>

                <div className="ce-benefit-modal-note">
                  <Icon name="check" size={18}/>
                  <span>Você mantém o controle da sua própria operação.</span>
                </div>
              </section>
            </article>
          )
        })}
      </div>
    </>
  )
}
