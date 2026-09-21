'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'

const plans = [
  {
    id:'essencial',
    name:'Essencial',
    eyebrow:'PARA COMEÇAR',
    price:'R$ 49,90',
    suffix:'/mês',
    description:'Para operações menores que querem profissionalizar as entregas sem perder simplicidade.',
    deliveries:'Até 300 entregas/mês',
    stores:'1 loja',
    fee:'Tarifa operacional por entrega',
    featured:false,
    features:[
      'Portal completo da loja',
      'Rede de entregadores',
      'Mapa e acompanhamento ao vivo',
      'Chat operacional',
      'Carteira e histórico financeiro',
      'Suporte padrão',
    ],
  },
  {
    id:'profissional',
    name:'Profissional',
    eyebrow:'MAIS ESCOLHIDO',
    price:'R$ 99,90',
    suffix:'/mês',
    description:'Para quem tem maior volume e precisa de despacho, automação e controle operacional avançado.',
    deliveries:'Até 1.500 entregas/mês',
    stores:'Até 3 lojas',
    fee:'Tarifa operacional reduzida',
    featured:true,
    features:[
      'Tudo do plano Essencial',
      'Despacho inteligente',
      'Agrupamento de até 3 entregas',
      'Usuários e permissões',
      'Integrações operacionais',
      'Indicadores avançados',
    ],
  },
  {
    id:'rede',
    name:'Rede',
    eyebrow:'PARA ESCALAR',
    price:'Sob consulta',
    suffix:'',
    description:'Para redes e operações com várias unidades, alto volume e regras comerciais personalizadas.',
    deliveries:'Volume personalizado',
    stores:'Múltiplas lojas',
    fee:'Condição comercial personalizada',
    featured:false,
    features:[
      'Tudo do plano Profissional',
      'Multi-loja avançado',
      'Gestão centralizada de unidades',
      'Regras comerciais por operação',
      'Integrações prioritárias',
      'Atendimento dedicado',
    ],
  },
] as const

function formatNumber(value:number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function PublicPricingExperience() {
  const [deliveries,setDeliveries] = useState(450)
  const [stores,setStores] = useState(1)

  const recommendation = useMemo(() => {
    if (stores > 3 || deliveries > 1500) return plans[2]
    if (stores > 1 || deliveries > 300) return plans[1]
    return plans[0]
  },[deliveries,stores])

  return (
    <>
      <div className="public-pricing-grid">
        {plans.map(plan => (
          <article
            key={plan.id}
            className={plan.featured ? 'public-price-card featured' : 'public-price-card'}
          >
            {plan.featured ? (
              <div className="public-price-ribbon">MAIS ESCOLHIDO</div>
            ) : null}

            <div className="public-price-top">
              <small>{plan.eyebrow}</small>
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
            </div>

            <div className="public-price-value">
              <strong>{plan.price}</strong>
              <span>{plan.suffix}</span>
            </div>

            <div className="public-price-usage">
              <span><Icon name="box" size={17}/>{plan.deliveries}</span>
              <span><Icon name="store" size={17}/>{plan.stores}</span>
              <span><Icon name="money" size={17}/>{plan.fee}</span>
            </div>

            <ul>
              {plan.features.map(feature => (
                <li key={feature}>
                  <Icon name="check" size={15}/>
                  {feature}
                </li>
              ))}
            </ul>

            <Link href="/cadastro" className={plan.featured ? 'public-price-cta primary' : 'public-price-cta'}>
              {plan.id === 'rede' ? 'FALAR SOBRE MINHA REDE' : 'COMEÇAR COM ESTE PLANO'}
              <Icon name="arrow" size={15}/>
            </Link>
          </article>
        ))}
      </div>

      <div className="public-plan-simulator">
        <div className="public-plan-simulator-copy">
          <div className="public-kicker"><i/> SIMULADOR DE PLANO</div>
          <h3>Qual plano combina com a sua operação?</h3>
          <p>
            Ajuste seu volume e quantidade de lojas. O simulador indica a opção mais adequada
            para começar; a condição final pode ser configurada no cadastro.
          </p>
        </div>

        <div className="public-plan-controls">
          <label>
            <span>
              <strong>Entregas por mês</strong>
              <b>{formatNumber(deliveries)}</b>
            </span>
            <input
              type="range"
              min="50"
              max="3000"
              step="50"
              value={deliveries}
              onChange={event => setDeliveries(Number(event.target.value))}
            />
            <em><span>50</span><span>3.000+</span></em>
          </label>

          <label>
            <span>
              <strong>Quantidade de lojas</strong>
              <b>{stores}</b>
            </span>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={stores}
              onChange={event => setStores(Number(event.target.value))}
            />
            <em><span>1</span><span>10+</span></em>
          </label>
        </div>

        <div className="public-plan-result">
          <span className="public-plan-result-icon">
            <Icon name={recommendation.id === 'rede' ? 'store' : 'lightning'} size={24}/>
          </span>
          <div>
            <small>PLANO SUGERIDO</small>
            <strong>{recommendation.name}</strong>
            <p>{recommendation.deliveries} · {recommendation.stores}</p>
          </div>
          <Link href="/cadastro">
            Criar minha loja <Icon name="arrow" size={15}/>
          </Link>
        </div>
      </div>
    </>
  )
}
