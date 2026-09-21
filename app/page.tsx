import Link from 'next/link'
import { Icon } from '@/components/icon'
import { createClient } from '@/lib/supabase/server'

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
          <a href="#planos">Para lojas</a>
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

      <section className="public-plans" id="planos">
        <div className="public-plans-head">
          <div className="public-kicker"><i/> PARA NEGÓCIOS DE TODOS OS TAMANHOS</div>
          <h2>Sua operação pode começar <span>com uma loja.</span></h2>
          <p>
            A mesma arquitetura permite crescer para várias unidades e equipes sem criar
            um sistema separado para cada estabelecimento.
          </p>
        </div>

        <div className="public-plans-grid">
          <article>
            <small>COMEÇANDO</small>
            <h3>Uma loja</h3>
            <p>Para quem quer organizar a própria operação de entregas em um único painel.</p>
            <ul>
              <li>Portal completo da loja</li>
              <li>Carteira e financeiro</li>
              <li>Despacho e mapa</li>
              <li>Rede de entregadores</li>
            </ul>
            <Link href="/cadastro">CRIAR MINHA LOJA</Link>
          </article>

          <article className="featured">
            <div className="public-plan-label">ARQUITETURA MULTI-LOJA</div>
            <small>CRESCENDO</small>
            <h3>Rede de lojas</h3>
            <p>Para empresas que precisam administrar mais de uma unidade dentro da mesma conta.</p>
            <ul>
              <li>Várias operações</li>
              <li>Usuários e permissões</li>
              <li>Dados separados por unidade</li>
              <li>Visão administrativa</li>
            </ul>
            <Link href="/cadastro">COMEÇAR AGORA</Link>
          </article>
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

      <footer className="public-footer">
        <div className="public-footer-brand">
          <img src="/brand/chamaentrega-logo-official.webp" alt="ChamaEntrega"/>
          <p>Logística conectada para lojas e entregadores.</p>
        </div>

        <div>
          <strong>Produto</strong>
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#diferenciais">Diferenciais</a>
        </div>

        <div>
          <strong>Para lojas</strong>
          <Link href="/cadastro">Criar conta</Link>
          <Link href="/login">Entrar</Link>
          <a href="#planos">Soluções</a>
        </div>

        <div className="public-footer-bottom">
          <span>© 2026 ChamaEntrega.</span>
          <span>Chamou, chegou.</span>
        </div>
      </footer>
    </main>
  )
}
