import Link from 'next/link'
import { Icon } from '@/components/icon'
import { createClient } from '@/lib/supabase/server'

const howSteps = [
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

const resources = [
  ['store','Portal da Loja','Gestão completa da sua operação de entregas.'],
  ['route','Despacho inteligente','Encontre o entregador ideal e organize a saída.'],
  ['pin','Mapa ao vivo','Acompanhe as entregas e a localização em tempo real.'],
  ['chat','Chat operacional','Comunicação rápida entre loja e entregador.'],
  ['money','Carteira pré-paga','Mais segurança e controle financeiro.'],
  ['users','Rede particular de entregadores','Sua rede, suas regras e suas aprovações.'],
  ['link','Integrações','Conecte cardápio, sistemas e canais de venda.'],
  ['chart','Painel administrativo','Relatórios, métricas e visão da sua operação.'],
]

const plans = [
  {
    name:'Essencial',
    subtitle:'Ideal para operações menores',
    price:'R$ 49,90',
    suffix:'/mês',
    featured:false,
    features:['Portal da loja','Gestão de entregas','Mapa em tempo real','Chat com entregadores','Suporte por e-mail','Até 1 loja'],
    cta:'Começar agora',
  },
  {
    name:'Profissional',
    subtitle:'Para negócios em crescimento',
    price:'R$ 99,90',
    suffix:'/mês',
    featured:true,
    features:['Todos os recursos do Essencial','Despacho inteligente','Carteira pré-paga','Relatórios avançados','Integrações','Até 3 lojas'],
    cta:'Começar agora',
  },
  {
    name:'Rede',
    subtitle:'Para redes e grandes operações',
    price:'Sob consulta',
    suffix:'',
    featured:false,
    features:['Todas as funcionalidades','Múltiplas lojas','Condições especiais','Suporte prioritário','Implantação assistida','Soluções personalizadas'],
    cta:'Falar com o time',
  },
]

const trustCards = [
  ['LO','Loja organizada','Mais visibilidade sobre pedidos, entregadores e andamento das corridas.'],
  ['EP','Entregador parceiro','Mais oportunidades de receber ofertas de diferentes redes próximas.'],
  ['RR','Rede regional','Restaurantes vizinhos ajudam a ampliar a base de entregadores da região.'],
  ['OP','Operação própria','A loja ganha uma alternativa para estruturar sua própria logística de entrega.'],
]

export default async function PublicHomePage() {
  const supabase = await createClient()
  const { data:claimsData } = await supabase.auth.getClaims()
  const signedIn = Boolean(claimsData?.claims?.sub)

  return (
    <main className="ce-showcase">
      <header className="ce-header">
        <Link href="/" className="ce-logo" aria-label="ChamaEntrega">
          <img src="/brand/chamaentrega-logo-official.webp" alt="ChamaEntrega"/>
        </Link>

        <nav>
          <a href="#como-usar">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#planos">Planos</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="ce-header-actions">
          <Link href={signedIn ? '/painel' : '/login'} className="ce-link-button">
            {signedIn ? 'Abrir painel' : 'Entrar'}
          </Link>
          <Link href="/cadastro" className="ce-primary-button">
            Criar minha loja <Icon name="arrow" size={15}/>
          </Link>
        </div>
      </header>

      <section className="ce-hero">
        <div className="ce-hero-copy">
          <div className="ce-eyebrow"><i/> LOGÍSTICA INTELIGENTE PARA O SEU NEGÓCIO</div>
          <h1>
            Sua loja chama.<br/>
            <span>O ChamaEntrega<br/>resolve.</span>
          </h1>
          <p>
            Uma plataforma completa para restaurantes e lojas que querem organizar
            sua própria operação de entrega, reduzir a dependência de marketplaces
            e fazer parte de uma rede regional de apoio entre negócios.
          </p>

          <div className="ce-hero-actions">
            <Link href="/cadastro" className="ce-primary-button big">
              Criar minha loja <Icon name="arrow" size={16}/>
            </Link>
            <a href="#como-usar" className="ce-secondary-button">Conhecer a plataforma</a>
          </div>

          <div className="ce-proof">
            <span>✓ Cadastro da loja online</span>
            <span>✓ Operação separada por empresa</span>
            <span>✓ Painel em tempo real</span>
          </div>
        </div>

        <div className="ce-hero-art">
          <div className="ce-owner-card">
            <small>VISÃO DA LOJA</small>
            <strong>Mais controle para o negócio</strong>
          </div>

          <div className="ce-live-card">
            <i/> OPERAÇÃO AO VIVO
          </div>

          <div className="ce-hero-status">
            <span><Icon name="lightning" size={15}/> Entregador encontrado</span>
            <span><Icon name="money" size={15}/> Saldo protegido</span>
          </div>
        </div>
      </section>

      <section className="ce-how" id="como-usar">
        <div className="ce-section-title inline">
          <div>
            <h2>Como usar o <span>ChamaEntrega</span></h2>
            <p>Do seu restaurante à rede de entregadores da região. Simples, prático e inteligente.</p>
          </div>
          <em>Em poucos passos,<br/>sua operação evolui!</em>
        </div>

        <div className="ce-how-grid">
          {howSteps.map(step => (
            <article key={step.n}>
              <div className="ce-step-number">{step.n}</div>

              <div className="ce-step-icon">
                {step.kind === 'marketplaces' ? (
                  <div className="ce-marketplace-logos">
                    <img src="/integrations/ifood.svg" alt="iFood"/>
                    <img src="/integrations/99food.svg" alt="99Food"/>
                  </div>
                ) : (
                  <Icon name={step.icon ?? 'box'} size={29}/>
                )}
              </div>

              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ce-network">
        <div className="ce-network-copy">
          <h2>Como nasce uma <span>rede compartilhada</span></h2>
          <h3>Restaurantes independentes. Entregadores mais conectados. Uma região mais forte.</h3>
          <p>
            Cada loja mantém sua própria rede particular de entregadores, mas os mesmos
            profissionais podem solicitar entrada em outras lojas da região. Uma loja vizinha
            que também adota o ChamaEntrega pode convidar novos profissionais, que passam a
            fortalecer toda a região.
          </p>
          <p>
            Assim, criamos um ecossistema de apoio mútuo: mais restaurantes conectados,
            mais entregadores disponíveis, menos tempo ocioso e mais possibilidades de
            atendimento para cada operação.
          </p>

          <div className="ce-network-note">
            <Icon name="lightning" size={19}/>
            <span>
              Se hoje você usa entrega sob demanda em marketplaces, pode estruturar sua
              própria base de entregadores e, quando a sua operação estiver pronta, avaliar
              o modelo de entrega própria.
            </span>
          </div>
        </div>

        <div className="ce-network-art">
          <div className="ce-store-node n1"><strong>Restaurante A</strong><small>Rede de entregadores</small></div>
          <div className="ce-store-node n2"><strong>Restaurante B</strong><small>Rede de entregadores</small></div>
          <div className="ce-store-node n3"><strong>Restaurante C</strong><small>Rede de entregadores</small></div>
          <div className="ce-network-riders">
            <span><img src="/brand/chamaentrega-flame-official.webp" alt=""/></span>
            <span><img src="/brand/chamaentrega-flame-official.webp" alt=""/></span>
            <span><img src="/brand/chamaentrega-flame-official.webp" alt=""/></span>
          </div>
          <div className="ce-network-caption">
            <strong>Entregadores da região</strong>
            <small>Podem fazer parte de uma ou mais redes de restaurantes</small>
          </div>
        </div>
      </section>

      <section className="ce-resources" id="recursos">
        <div className="ce-section-title compact">
          <h2>Recursos que impulsionam sua operação</h2>
          <p>Tudo o que você precisa em um só lugar.</p>
        </div>

        <div className="ce-resource-grid">
          {resources.map(([icon,title,text]) => (
            <article key={title}>
              <span><Icon name={icon} size={23}/></span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ce-plans" id="planos">
        <div className="ce-section-title compact">
          <h2>Planos para cada fase da sua operação</h2>
          <p>Cresça no seu ritmo. Sempre com o ChamaEntrega.</p>
        </div>

        <div className="ce-plans-layout">
          <div className="ce-plan-grid">
            {plans.map(plan => (
              <article key={plan.name} className={plan.featured ? 'featured' : ''}>
                {plan.featured ? <div className="ce-plan-tag">MAIS ESCOLHIDO</div> : null}
                <h3>{plan.name}</h3>
                <small>{plan.subtitle}</small>
                <div className="ce-plan-price">
                  <strong>{plan.price}</strong><span>{plan.suffix}</span>
                </div>

                <ul>
                  {plan.features.map(feature => (
                    <li key={feature}><Icon name="check" size={15}/>{feature}</li>
                  ))}
                </ul>

                <Link href="/cadastro">
                  {plan.cta} <Icon name="arrow" size={14}/>
                </Link>
              </article>
            ))}
          </div>

          <div className="ce-plan-art" aria-label="Entregador ChamaEntrega representando o crescimento da rede">
            <div className="ce-plan-art-copy">
              <strong>Juntos,<br/>o delivery<br/>da sua região<br/>vai mais longe!</strong>
              <span><Icon name="store" size={15}/> Mais negócios</span>
              <span><Icon name="users" size={15}/> Mais entregas</span>
              <span><Icon name="chart" size={15}/> Mais oportunidades</span>
              <span><Icon name="map" size={15}/> Uma região mais forte</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ce-testimonials">
        <div className="ce-section-title compact">
          <div>
            <h2>Quem entra na rede, <span>ganha força</span></h2>
            <p>Uma experiência pensada para lojas e entregadores trabalharem de forma mais conectada.</p>
          </div>
          <span className="ce-testimonials-caption">Uma rede cresce quando todos ajudam a fortalecê-la.</span>
        </div>

        <div className="ce-testimonials-grid">
          {trustCards.map(([initials,title,text]) => (
            <article key={title}>
              <span className="ce-testimonial-avatar">{initials}</span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
                <em>CHAMAENTREGA</em>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ce-faq" id="faq">
        <div className="ce-section-title compact">
          <h2>Dúvidas frequentes</h2>
          <a href="#como-usar">Ver como funciona →</a>
        </div>

        <div className="ce-faq-grid">
          <details>
            <summary>O que é o ChamaEntrega?<Icon name="plus" size={16}/></summary>
            <p>É uma plataforma para lojas organizarem sua operação de entregas, sua rede de entregadores e o acompanhamento das corridas.</p>
          </details>
          <details>
            <summary>Como funciona a rede de entregadores?<Icon name="plus" size={16}/></summary>
            <p>Cada loja pode aprovar sua própria rede. O mesmo entregador pode solicitar participação em outras redes próximas.</p>
          </details>
          <details>
            <summary>Preciso sair do iFood ou 99Food para usar?<Icon name="plus" size={16}/></summary>
            <p>Não. A loja pode continuar usando seus canais atuais e estruturar gradualmente uma operação própria de entrega.</p>
          </details>
          <details>
            <summary>Posso ter mais de uma loja?<Icon name="plus" size={16}/></summary>
            <p>Sim. Os planos superiores suportam múltiplas operações e gestão por unidade.</p>
          </details>
          <details>
            <summary>O entregador pode pedir entrada na minha rede?<Icon name="plus" size={16}/></summary>
            <p>Sim. A solicitação aparece para a loja, que decide se aprova ou não aquele profissional.</p>
          </details>
          <details>
            <summary>A assinatura inclui o valor das entregas?<Icon name="plus" size={16}/></summary>
            <p>Não. A assinatura dá acesso à plataforma. A operação de entrega tem cobrança separada conforme a regra comercial definida.</p>
          </details>
        </div>
      </section>

      <footer className="ce-footer">
        <div className="ce-footer-main">
          <div className="ce-footer-brand">
            <img src="/brand/chamaentrega-logo-official.webp" alt="ChamaEntrega"/>
            <p>
              Tecnologia para um delivery mais organizado, independente e conectado.
              Mais controle para sua loja e uma rede regional mais forte.
            </p>
            <span><i/> Plataforma online</span>
          </div>

          <div>
            <strong>Plataforma</strong>
            <a href="#como-usar">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#planos">Planos</a>
            <a href="#faq">FAQ</a>
          </div>

          <div>
            <strong>Para lojas</strong>
            <Link href="/cadastro">Criar minha loja</Link>
            <Link href="/login">Portal da loja</Link>
            <a href="#recursos">Carteira</a>
            <a href="#recursos">Rede de entregadores</a>
          </div>

          <div>
            <strong>Operação</strong>
            <a href="#como-usar">Para entregadores</a>
            <a href="#recursos">Rede de parceiros</a>
            <a href="#recursos">Mapa ao vivo</a>
            <a href="#recursos">Integrações</a>
          </div>

          <div>
            <strong>Suporte</strong>
            <a href="#faq">Central de ajuda</a>
            <a href="#faq">Fale conosco</a>
            <a href="#planos">Planos e condições</a>
            <a href="#faq">Privacidade e segurança</a>
          </div>

          <div className="ce-footer-cta">
            <strong>Pronto para evoluir seu delivery?</strong>
            <p>Junte-se a uma rede de negócios que fazem parte do ChamaEntrega.</p>
            <Link href="/cadastro">Criar minha loja <Icon name="arrow" size={14}/></Link>
          </div>
        </div>

        <div className="ce-footer-bottom">
          <span>© 2026 ChamaEntrega. Todos os direitos reservados.</span>
          <strong>Chamou, chegou.</strong>
          <div><span>Instagram</span><span>Facebook</span><span>WhatsApp</span></div>
        </div>
      </footer>
    </main>
  )
}
