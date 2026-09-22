'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/icon'

type Step = {
  n: string
  title: string
  text: string
  kind?: 'marketplaces'
  icon?: string
}

const steps: Step[] = [
  {
    n:'1',
    title:'Sua loja já vende no iFood ou 99Food?',
    text:'Se hoje você usa o modelo sob demanda, pode começar a estruturar uma base própria de entregadores para reduzir dependência operacional.',
    kind:'marketplaces',
  },
  {
    n:'2',
    title:'Convide seus entregadores',
    text:'Convide profissionais que já conhecem sua operação para baixar o ChamaEntrega e solicitar entrada na rede da sua loja.',
    icon:'users',
  },
  {
    n:'3',
    title:'Use seu cardápio digital',
    text:'Ative seu próprio canal de pedidos e, quando fizer sentido para sua operação, trabalhe com entrega própria.',
    icon:'box',
  },
  {
    n:'4',
    title:'Aprove a entrada na sua rede',
    text:'Os entregadores solicitam entrada na rede particular do restaurante e a loja decide quem aprovar pelo painel.',
    icon:'user',
  },
  {
    n:'5',
    title:'Compartilhe força na região',
    text:'Lojas próximas também podem convidar entregadores, e os mesmos profissionais podem participar de várias redes parceiras.',
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
              <p>O conteúdo completo deste passo será inserido aqui com o texto que você definir.</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
