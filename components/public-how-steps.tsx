'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/icon'

type Step = {
  n: string
  title: string
  text: string
  kind?: 'marketplaces'
  icon?: string
  detail?: string
}

const steps: Step[] = [
  {
    n:'1',
    title:'Sua loja já vende no iFood ou 99Food?',
    text:'Se hoje você usa o modelo sob demanda, pode começar a estruturar uma base própria de entregadores para reduzir dependência operacional.',
    detail:'Marketplaces como iFood e 99Food oferecem praticidade no modelo sob demanda, mas esse formato costuma ter taxas mais altas para a loja. Você não precisa mudar tudo de uma vez: pode continuar usando o plano atual e, quando fizer sentido para a sua operação, migrar para a entrega própria com o ChamaEntrega como apoio. Durante essa transição, aproveite para formar sua própria rede. Convide entregadores que já atenderam sua loja, transmitiram confiança e com quem você criou uma boa relação no dia a dia. Quando restaurantes vizinhos fizerem o mesmo, mais profissionais passam a circular pela região e podem solicitar entrada em diferentes redes. Assim, você continua escolhendo quem faz parte da sua operação, mas ganha acesso a uma base regional mais ampla — formada pelos entregadores que você convidou e também por profissionais indicados por outras lojas. O resultado é um ecossistema colaborativo, com mais disponibilidade de entregadores e mais autonomia para os restaurantes da região.',
    kind:'marketplaces',
  },
  {
    n:'2',
    title:'Convide seus entregadores',
    text:'Convide profissionais que já conhecem sua operação para baixar o ChamaEntrega e solicitar entrada na rede da sua loja.',
    detail:'No dia a dia, sua loja já tem contato com diversos entregadores que trabalham por plataformas como iFood e 99Food. Aproveite essa proximidade para convidar, de forma direta e voluntária, os profissionais que demonstraram confiança, responsabilidade e bom atendimento para fazer parte da sua rede no ChamaEntrega. Sabemos que manter uma operação própria de entregas ficou mais difícil: há falta de profissionais disponíveis e muitos entregadores preferem trabalhar com liberdade, atendendo diferentes estabelecimentos, em vez de permanecer fixos em uma única loja. A proposta do ChamaEntrega é justamente se adaptar a essa nova realidade. Você constrói sua própria rede, sem exigir exclusividade, e passa a fazer parte de um ecossistema regional em que outros restaurantes também podem convidar bons profissionais. Com isso, mais entregadores ficam disponíveis na sua região, enquanto cada loja continua escolhendo quem pode entrar em sua rede. É uma forma mais flexível de organizar a entrega própria, ampliar a disponibilidade e reduzir a dependência de uma equipe fixa.',
    icon:'users',
  },
  {
    n:'3',
    title:'Use seu cardápio digital',
    text:'Ative seu próprio canal de pedidos e, quando fizer sentido para sua operação, trabalhe com entrega própria.',
    detail:'Ter um cardápio digital próprio é um passo importante para ganhar mais autonomia na sua operação. Em vez de depender apenas dos marketplaces para receber pedidos, você pode criar um canal direto com seus clientes, divulgar seu próprio link nas redes sociais, no WhatsApp e em materiais da loja e concentrar parte das vendas em um ambiente que pertence ao seu negócio. Quando o pedido entrar pelo seu canal próprio e estiver pronto para sair, o ChamaEntrega pode apoiar a etapa da entrega, conectando sua loja aos entregadores disponíveis da sua rede. Assim, você começa a construir uma operação mais independente, mantém contato direto com seus clientes e passa a ter mais controle sobre pedidos, relacionamento e logística. A ideia não é abandonar os marketplaces de uma vez, mas criar um segundo caminho de vendas que possa crescer gradualmente junto com a sua rede de entregadores.',
    icon:'box',
  },
  {
    n:'4',
    title:'Aprove a entrada na sua rede',
    text:'Os entregadores solicitam entrada na rede particular do restaurante e a loja decide quem aprovar pelo painel.',
    detail:'Sua rede continua sendo sua. No ChamaEntrega, nenhum entregador entra automaticamente na operação da sua loja: quando um profissional solicitar acesso, você recebe o pedido pelo painel e decide se quer aprová-lo ou não. Isso permite analisar quem já conhece sua operação, quem foi convidado por você e também profissionais que fazem parte da rede de outros restaurantes da região. Com o tempo, sua loja pode construir uma base de entregadores de confiança sem depender de uma equipe fixa. Você mantém o controle sobre quem pode receber suas entregas e, ao mesmo tempo, ganha a possibilidade de ampliar sua rede quando precisar de mais disponibilidade. É a combinação entre autonomia e colaboração: a região compartilha profissionais, mas cada estabelecimento continua tendo sua própria rede e suas próprias aprovações.',
    icon:'user',
  },
  {
    n:'5',
    title:'Compartilhe força na região',
    text:'Lojas próximas também podem convidar entregadores, e os mesmos profissionais podem participar de várias redes parceiras.',
    detail:'O ChamaEntrega foi pensado para transformar uma dificuldade comum em força coletiva. Em vez de cada restaurante tentar manter sozinho uma equipe completa de entregadores, as lojas da mesma região podem fortalecer um ecossistema em comum. Cada estabelecimento continua com sua própria rede e decide quem aprovar, mas os profissionais podem fazer parte de diferentes redes parceiras, aumentando as chances de haver alguém disponível quando uma entrega surgir. Na prática, o entregador que hoje atende uma loja vizinha também pode solicitar entrada na sua rede, assim como os profissionais convidados por você podem trabalhar com outros estabelecimentos da região. Quanto mais lojas participarem e mais entregadores forem convidados, maior tende a ser a disponibilidade local. O objetivo é criar uma rede regional mais equilibrada, com mais oportunidades para os entregadores e mais alternativas para os restaurantes, sem tirar de cada loja o controle sobre sua própria operação.',
    icon:'route',
  },
  {
    n:'6',
    title:'Quanto mais lojas, maior a rede',
    text:'Com mais restaurantes e entregadores conectados, nasce uma rede regional de apoio com mais disponibilidade para todos.',
    icon:'chart',
  },
]

export function PublicHowSteps() {
  const [activeStep, setActiveStep] = useState<Step | null>(null)

  useEffect(() => {
    if (!activeStep) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveStep(null)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeStep])

  return (
    <>
      <div className="ce-how-grid">
        {steps.map(step => (
          <article key={step.n} className="ce-how-step-card">
            <button
              type="button"
              className="ce-how-step-button"
              onClick={() => setActiveStep(step)}
              aria-label={`Abrir explicação do passo ${step.n}: ${step.title}`}
            >
              <div className="ce-step-number">{step.n}</div>

              <div className="ce-step-icon">
                {step.kind === 'marketplaces' ? (
                  <div className="ce-marketplace-logos">
                    <img src="/integrations/ifood.svg" alt="iFood"/>
                    <img src="/integrations/99food.svg" alt="99Food"/>
                  </div>
                ) : (
                  <Icon name={step.icon ?? 'box'} size={31}/>
                )}
              </div>

              <h3>{step.title}</h3>
              <p>{step.text}</p>

              <span className="ce-how-step-more">
                Ver explicação <Icon name="arrow" size={15}/>
              </span>
            </button>
          </article>
        ))}
      </div>

      {activeStep ? (
        <div
          className="ce-step-modal-backdrop"
          role="presentation"
          onMouseDown={() => setActiveStep(null)}
        >
          <section
            className="ce-step-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ce-step-modal-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="ce-step-modal-close"
              onClick={() => setActiveStep(null)}
              aria-label="Fechar explicação"
            >
              ×
            </button>

            <div className="ce-step-modal-badge">PASSO {activeStep.n}</div>
            <h3 id="ce-step-modal-title">{activeStep.title}</h3>
            <p className="ce-step-modal-summary">{activeStep.text}</p>

            <div className="ce-step-modal-content">
              <strong>Explicação detalhada</strong>
              <p>{activeStep.detail ?? 'O conteúdo completo deste passo será inserido aqui com o texto que você definir.'}</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
