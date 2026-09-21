import Link from 'next/link'
import { Icon } from '@/components/icon'
import { createClient } from '@/lib/supabase/server'
import { PublicPricingExperience } from '@/components/public-pricing-experience'

const features = [
  {
    icon:'route',
    title:'Despacho Inteligente',
    text:'Agrupe até 3 entregas, organize a rota e direcione a oferta para o entregador disponível mais adequado.',
  },
  {
    icon:'map',
    title:'Mapa ao vivo',
    text:'Acompanhe o andamento das corridas e a última localização enviada pelo aplicativo do entregador.',
  },
  {
    icon:'money',
    title:'Carteira pré-paga',
    text:'Controle saldo, valores reservados e o custo das entregas em uma operação financeira centralizada.',
  },
  {
    icon:'chat',
    title:'Chat operacional',
    text:'Loja e entregador conversam dentro do fluxo da corrida, sem perder o contexto de cada pedido.',
  },
  {
    icon:'link',
    title:'Integrações',
    text:'A arquitetura está preparada para receber pedidos de cardápio próprio, WhatsApp, Goomer e marketplaces.',
  },
  {
    icon:'chart',
    title:'Gestão em tempo real',
    text:'Pedidos, entregas, entregadores, indicadores e histórico reunidos no mesmo Portal da Loja.',
  },
]

const steps = [
  ['01','Crie sua conta','Cadastre o responsável pela operação e confirme o acesso ao ChamaEntrega.'],
  ['02','Configure sua loja','Informe nome, telefone e o ponto exato onde os entregadores retiram os pedidos.'],
  ['03','Publique o pedido pronto','Localize o cliente, veja a taxa sugerida e só então coloque a corrida na rede.'],
  ['04','Acompanhe a entrega','Veja aceite, rota, chat, financeiro e conclusão em um único painel.'],
]

export default async function PublicHomePage() {
  const supabase = await createClient()
  const { data:claimsData } = await supabase.auth.getClaims()
  const signedIn = Boolean(claimsData?.claims?.sub)

  return (
    <main className="public-site">
      <header className="public-header">
        <Link href="/" className="public-logo" aria-label="ChamaEntrega">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            alt="ChamaEntrega — Chamou, Chegou"
          />
        </Link>

        <nav className="public-nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#diferenciais">Diferenciais</a>
          <a href="#planos">Planos</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="public-header-actions">
          {signedIn ? (
            <Link href="/painel" className="public-login">Abrir painel</Link>
          ) : (
            <Link href="/login" className="public-login">Entrar</Link>
          )}
          <Link href="/cadastro" className="public-primary small">
            Criar minha loja <Icon name="arrow" size={15}/>
          </Link>
        </div>
      </header>

      <section className="public-hero">
        <div className="public-hero-glow one"/>
        <div className="public-hero-glow two"/>

        <div className="public-hero-copy">
          <div className="public-kicker">
            <i/> LOGÍSTICA PARA QUEM VENDE
          </div>

          <h1>
            Sua loja chama.<br/>
            <span>O ChamaEntrega resolve.</span>
          </h1>

          <p>
            Uma plataforma criada para lojas que precisam de entregadores sem abrir mão do
            controle da operação. Publique pedidos prontos, acompanhe corridas e organize
            sua logística em um único lugar.
          </p>

          <div className="public-hero-actions">
            <Link href="/cadastro" className="public-primary">
              CRIAR MINHA LOJA <Icon name="arrow" size={17}/>
            </Link>
            <a href="#produto" className="public-secondary">
              CONHECER A PLATAFORMA
            </a>
          </div>

          <div className="public-hero-proof">
            <span><b>✓</b> Cadastro da loja online</span>
            <span><b>✓</b> Operação separada por empresa</span>
            <span><b>✓</b> Painel em tempo real</span>
          </div>
        </div>

        <div className="public-product-stage" id="produto">
          <div className="public-stage-badge">
            <i/> OPERAÇÃO AO VIVO
          </div>

          <div className="public-browser">
            <div className="public-browser-top">
              <span/><span/><span/>
              <div>portal.chamaentrega.com.br</div>
            </div>

            <div className="public-dashboard">
              <aside>
                <img
                  src="/brand/chamaentrega-logo-official.webp"
                  alt=""
                />
                <div className="public-mini-store">
                  <b>ML</b>
                  <span><strong>Minha Loja</strong><small>● Loja ativa</small></span>
                </div>
                {[
                  ['home','Visão Geral'],
                  ['box','Pedidos'],
                  ['plus','Criar entrega'],
                  ['route','Despacho'],
                  ['map','Mapa ao vivo'],
                  ['money','Financeiro'],
                ].map(([icon,label],index) => (
                  <div className={index===0 ? 'active' : ''} key={label}>
                    <Icon name={icon} size={13}/><span>{label}</span>
                  </div>
                ))}
              </aside>

              <section>
                <div className="public-dash-head">
                  <span>Portal da Loja</span>
                  <em>● Sistema online</em>
                </div>

                <div className="public-dash-welcome">
                  <small>OPERAÇÃO EM TEMPO REAL</small>
                  <strong>Olá, <b>Minha Loja.</b></strong>
                  <span>Acompanhe suas entregas e resultados em tempo real.</span>
                </div>

                <div className="public-dash-metrics">
                  <article><small>Entregas hoje</small><strong>18</strong><span>Pedidos criados</span></article>
                  <article><small>Em andamento</small><strong>4</strong><span>Corridas aceitas</span></article>
                  <article><small>Disponíveis</small><strong>7</strong><span>Entregadores online</span></article>
                </div>

                <div className="public-dash-grid">
                  <article className="orders">
                    <header><strong>Entregas de hoje</strong><span>Ver todas →</span></header>
                    {[['#4A72','Camila Souza','Buscando entregador'],['#91B3','Mercado Central','A caminho'],['#C840','João Pedro','Concluída']].map((row,index)=>(
                      <div className="public-order-row" key={row[0]}>
                        <b>{row[0]}</b>
                        <span>{row[1]}</span>
                        <em className={'s'+index}>{row[2]}</em>
                      </div>
                    ))}
                  </article>

                  <article className="route-card">
                    <small>DESPACHO INTELIGENTE</small>
                    <strong>3 entregas agrupadas</strong>
                    <div className="public-route-line">
                      <i/><span/><span/><b/>
                    </div>
                    <p>Rota otimizada automaticamente.</p>
                  </article>
                </div>
              </section>
            </div>
          </div>

          <div className="public-floating-card card-one">
            <span><Icon name="lightning" size={18}/></span>
            <div><small>NOVA ENTREGA</small><strong>Entregador encontrado</strong></div>
          </div>

          <div className="public-floating-card card-two">
            <span><Icon name="money" size={18}/></span>
            <div><small>CARTEIRA</small><strong>Saldo protegido</strong></div>
          </div>
        </div>
      </section>

      <section className="public-strip">
        <span>RESTAURANTES</span><i/>
        <span>HAMBURGUERIAS</span><i/>
        <span>FARMÁCIAS</span><i/>
        <span>MERCADOS</span><i/>
        <span>PET SHOPS</span><i/>
        <span>LOJAS</span>
      </section>

      <section className="public-problem" id="diferenciais">
        <div className="public-section-copy">
          <div className="public-kicker"><i/> POR QUE EXISTE</div>
          <h2>O ChamaEntrega nasceu do lado de quem <span>precisa entregar.</span></h2>
          <p>
            A proposta é simples: dar à loja mais controle sobre a logística e reduzir
            o tempo perdido entre pedido pronto, procura por entregador e acompanhamento da corrida.
          </p>
        </div>

        <div className="public-problem-grid">
          <article>
            <b>01</b>
            <Icon name="clock" size={27}/>
            <h3>Pedido realmente pronto</h3>
            <p>A loja decide quando publicar. O entregador não precisa chegar antes da hora e ficar esperando a produção.</p>
          </article>
          <article>
            <b>02</b>
            <Icon name="route" size={27}/>
            <h3>Rotas mais inteligentes</h3>
            <p>Pedidos próximos podem ser organizados em grupos de até 3 entregas para melhorar o aproveitamento da rota.</p>
          </article>
          <article>
            <b>03</b>
            <Icon name="store" size={27}/>
            <h3>Cada loja é independente</h3>
            <p>Conta, carteira, pedidos, entregas, configurações e dados ficam separados dentro da plataforma multi-loja.</p>
          </article>
        </div>
      </section>

      <section className="public-how" id="como-funciona">
        <div className="public-how-title">
          <div>
            <div className="public-kicker"><i/> DO CADASTRO À ENTREGA</div>
            <h2>Começar é <span>simples.</span></h2>
          </div>
          <p>
            A loja cria a própria operação dentro do ChamaEntrega. Não é necessário
            montar um dashboard separado para cada novo cliente.
          </p>
        </div>

        <div className="public-steps">
          {steps.map(([number,title,text],index) => (
            <article key={number}>
              <div className="public-step-top">
                <b>{number}</b>
                {index < steps.length-1 ? <i/> : null}
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-features" id="recursos">
        <div className="public-features-heading">
          <div className="public-kicker"><i/> CENTRAL DA OPERAÇÃO</div>
          <h2>Um painel. Toda a sua <span>logística.</span></h2>
          <p>
            O Portal da Loja reúne as ferramentas necessárias para publicar, acompanhar
            e administrar as entregas do dia a dia.
          </p>
        </div>

        <div className="public-features-grid">
          {features.map(feature => (
            <article key={feature.title}>
              <span><Icon name={feature.icon} size={22}/></span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-integration">
        <div className="public-integration-copy">
          <div className="public-kicker"><i/> ECOSSISTEMA</div>
          <h2>Os pedidos entram.<br/><span>O ChamaEntrega organiza a saída.</span></h2>
          <p>
            O projeto está sendo preparado para centralizar diferentes origens de pedido
            e conectá-las ao mesmo fluxo logístico.
          </p>
          <Link href="/cadastro" className="public-text-link">
            Criar minha operação <Icon name="arrow" size={15}/>
          </Link>
        </div>

        <div className="public-integration-board">
          <div className="public-integrations-left">
            <span className="whatsapp">WA</span>
            <span className="ifood">iF</span>
            <span className="food99">99</span>
            <span className="goomer">G</span>
            <span className="own">CE</span>
          </div>
          <div className="public-integration-lines"><i/><i/><i/><i/><i/></div>
          <div className="public-integration-core">
            <img src="/brand/chamaentrega-logo-official.webp" alt="ChamaEntrega"/>
            <small>CAIXA DE ENTRADA</small>
            <strong>Pedidos integrados</strong>
          </div>
          <div className="public-integration-arrow">→</div>
          <div className="public-integration-output">
            <span><Icon name="route" size={25}/></span>
            <small>LOGÍSTICA</small>
            <strong>Entrega criada</strong>
          </div>
        </div>
      </section>

      <section className="public-plans public-plans-v2" id="planos">
        <div className="public-plans-head public-plans-head-v2">
          <div>
            <div className="public-kicker"><i/> PLANOS DE ASSINATURA</div>
            <h2>Escolha a estrutura certa para <span>o seu momento.</span></h2>
          </div>
          <p>
            Comece com uma operação enxuta e evolua sem trocar de plataforma.
            Os planos organizam recursos, volume e suporte; a tarifa operacional por entrega
            pode variar conforme a condição comercial da loja.
          </p>
        </div>

        <PublicPricingExperience />

        <div className="public-pricing-note">
          <Icon name="shield" size={18}/>
          <p>
            Os valores exibidos são a configuração comercial inicial do projeto e podem ser
            alterados pela administração do ChamaEntrega. Custos das entregas são independentes
            da mensalidade.
          </p>
        </div>
      </section>

      <section className="public-operations">
        <div className="public-operations-copy">
          <div className="public-kicker"><i/> MAIS CONTROLE NO DIA A DIA</div>
          <h2>Não é só chamar um entregador.<br/><span>É operar melhor.</span></h2>
          <p>
            O ChamaEntrega conecta o pedido pronto à execução da entrega e mantém
            informações, comunicação e histórico organizados do início ao fim.
          </p>

          <div className="public-operations-list">
            <article>
              <span><Icon name="lightning" size={20}/></span>
              <div>
                <strong>Despacho inteligente</strong>
                <p>Publique apenas quando o pedido estiver pronto e encontre quem pode atender a corrida.</p>
              </div>
            </article>
            <article>
              <span><Icon name="map" size={20}/></span>
              <div>
                <strong>Acompanhamento operacional</strong>
                <p>Mapa, status e histórico reunidos para reduzir ligações e mensagens fora de contexto.</p>
              </div>
            </article>
            <article>
              <span><Icon name="users" size={20}/></span>
              <div>
                <strong>Rede particular de entregadores</strong>
                <p>Entregadores podem solicitar entrada na rede da loja e a empresa decide quem aprovar.</p>
              </div>
            </article>
            <article>
              <span><Icon name="chart" size={20}/></span>
              <div>
                <strong>Gestão para crescer</strong>
                <p>Indicadores, usuários, unidades, integrações e histórico sem perder a separação de cada loja.</p>
              </div>
            </article>
          </div>
        </div>

        <div className="public-operations-console">
          <div className="public-console-top">
            <span>OPERAÇÃO EM TEMPO REAL</span>
            <b><i/> Sistema online</b>
          </div>
          <div className="public-console-metrics">
            <article><small>Pedidos hoje</small><strong>24</strong><em>+18%</em></article>
            <article><small>Em rota</small><strong>6</strong><em>agora</em></article>
            <article><small>Entregadores</small><strong>12</strong><em>online</em></article>
          </div>
          <div className="public-console-flow">
            <div className="done"><span>1</span><strong>Pedido pronto</strong><small>12:42</small></div>
            <i/>
            <div className="done"><span>2</span><strong>Entregador aceitou</strong><small>12:44</small></div>
            <i/>
            <div className="active"><span>3</span><strong>A caminho</strong><small>agora</small></div>
            <i/>
            <div><span>4</span><strong>Entregue</strong><small>previsto</small></div>
          </div>
          <div className="public-console-bottom">
            <span><Icon name="chat" size={17}/> Chat da corrida</span>
            <span><Icon name="money" size={17}/> Financeiro</span>
            <span><Icon name="map" size={17}/> Mapa ao vivo</span>
          </div>
        </div>
      </section>

      <section className="public-faq" id="faq">
        <div className="public-faq-head">
          <div>
            <div className="public-kicker"><i/> DÚVIDAS FREQUENTES</div>
            <h2>Antes de começar, <span>saiba como funciona.</span></h2>
          </div>
          <p>
            Informações rápidas sobre cadastro, entregadores, cobrança e operação da plataforma.
          </p>
        </div>

        <div className="public-faq-grid">
          <details>
            <summary>Preciso ter entregadores próprios?<Icon name="plus" size={17}/></summary>
            <p>Não. A proposta é justamente permitir que a loja use a rede de entregadores parceiros e também organize sua rede particular.</p>
          </details>
          <details>
            <summary>Quando a entrega é publicada?<Icon name="plus" size={17}/></summary>
            <p>A loja cadastra o pedido e publica a corrida quando ele estiver realmente pronto, reduzindo espera desnecessária do entregador.</p>
          </details>
          <details>
            <summary>A assinatura inclui o valor das entregas?<Icon name="plus" size={17}/></summary>
            <p>Não. A mensalidade dá acesso aos recursos do plano. O custo ou tarifa operacional das entregas é tratado separadamente.</p>
          </details>
          <details>
            <summary>Posso administrar mais de uma loja?<Icon name="plus" size={17}/></summary>
            <p>Sim. Os planos superiores foram pensados para operações multi-loja, mantendo dados e permissões separados por unidade.</p>
          </details>
          <details>
            <summary>O entregador pode entrar na rede da minha loja?<Icon name="plus" size={17}/></summary>
            <p>Sim. Ele pode solicitar entrada pelo aplicativo e a loja aprova ou recusa pelo Portal da Loja.</p>
          </details>
          <details>
            <summary>Posso acompanhar a entrega em tempo real?<Icon name="plus" size={17}/></summary>
            <p>Sim. O projeto inclui mapa operacional, status da corrida e atualização de localização enviada pelo aplicativo do entregador.</p>
          </details>
        </div>
      </section>

      <section className="public-final-cta">
        <div className="public-final-fire">
          <img src="/brand/chamaentrega-logo-official.webp" alt=""/>
        </div>
        <div>
          <div className="public-kicker"><i/> CHAMOU, CHEGOU</div>
          <h2>Pronto para criar a operação da sua loja?</h2>
          <p>Cadastre sua empresa e abra seu próprio Portal da Loja no ChamaEntrega.</p>
        </div>
        <Link href="/cadastro" className="public-primary">
          CRIAR MINHA LOJA <Icon name="arrow" size={17}/>
        </Link>
      </section>

      <footer className="public-footer public-footer-v2">
        <div className="public-footer-main">
          <div className="public-footer-brand public-footer-brand-v2">
            <img src="/brand/chamaentrega-logo-official.webp" alt="ChamaEntrega"/>
            <p>
              Tecnologia para conectar lojas, entregadores e clientes em uma operação
              de entrega mais organizada, visível e profissional.
            </p>

            <div className="public-footer-status">
              <span><i/> Plataforma online</span>
              <strong>Chamou, chegou.</strong>
            </div>
          </div>

          <div className="public-footer-column">
            <strong>Plataforma</strong>
            <a href="#como-funciona">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#diferenciais">Diferenciais</a>
            <a href="#planos">Planos e preços</a>
            <a href="#faq">Perguntas frequentes</a>
          </div>

          <div className="public-footer-column">
            <strong>Para lojas</strong>
            <Link href="/cadastro">Criar minha loja</Link>
            <Link href="/login">Acessar Portal da Loja</Link>
            <a href="#planos">Comparar planos</a>
            <a href="#recursos">Despacho inteligente</a>
            <a href="#recursos">Mapa ao vivo</a>
          </div>

          <div className="public-footer-column">
            <strong>Operação</strong>
            <a href="#recursos">Rede de entregadores</a>
            <a href="#recursos">Carteira pré-paga</a>
            <a href="#recursos">Chat operacional</a>
            <a href="#recursos">Integrações</a>
            <a href="#como-funciona">Fluxo da entrega</a>
          </div>

          <div className="public-footer-column">
            <strong>Conta e suporte</strong>
            <Link href="/login">Entrar</Link>
            <Link href="/cadastro">Abrir conta</Link>
            <a href="#faq">Central de dúvidas</a>
            <a href="#planos">Condições comerciais</a>
            <span>Atendimento para lojas cadastradas pelo próprio Portal.</span>
          </div>
        </div>

        <div className="public-footer-cta">
          <div>
            <span><Icon name="lightning" size={20}/></span>
            <div>
              <small>PRONTO PARA COMEÇAR?</small>
              <strong>Crie sua operação e publique sua primeira entrega.</strong>
            </div>
          </div>
          <Link href="/cadastro" className="public-primary">
            CRIAR MINHA LOJA <Icon name="arrow" size={16}/>
          </Link>
        </div>

        <div className="public-footer-bottom public-footer-bottom-v2">
          <span>© 2026 ChamaEntrega. Todos os direitos reservados.</span>
          <div>
            <a href="#planos">Planos</a>
            <a href="#faq">Ajuda</a>
            <Link href="/login">Portal da Loja</Link>
          </div>
          <strong>CHAMOU, CHEGOU.</strong>
        </div>
      </footer>
    </main>
  )
}
