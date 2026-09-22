import { Icon } from '@/components/icon'

export function PublicHeader() {
  return (
    <header className="ce-header">
      <a href="/" className="ce-logo" aria-label="ChamaEntrega">
        <img
          src="/brand/chamaentrega-logo-official.webp"
          alt="ChamaEntrega"
          width={176}
          height={59}
          fetchPriority="high"
          decoding="async"
        />
      </a>

      <nav className="ce-desktop-nav" aria-label="Navegação principal">
        <a href="#como-usar">Como funciona</a>
        <a href="#recursos">Recursos</a>
        <a href="#planos">Planos</a>
        <a href="#faq">FAQ</a>
      </nav>

      <div className="ce-header-actions">
        <a href="/login" className="ce-link-button">
          Entrar
        </a>
        <a href="/cadastro" className="ce-primary-button">
          Criar minha loja <Icon name="arrow" size={15}/>
        </a>
      </div>

      <a
        href="#ce-mobile-menu"
        className="ce-mobile-menu-button"
        aria-label="Abrir menu"
        aria-controls="ce-mobile-menu"
      >
        <span />
        <span />
        <span />
      </a>

      <div id="ce-mobile-menu" className="ce-mobile-menu-layer">
        <a
          href="#conteudo"
          className="ce-mobile-menu-dismiss"
          aria-label="Fechar menu"
        />

        <nav
          id="ce-mobile-nav"
          className="ce-mobile-nav"
          aria-label="Menu mobile"
        >
          <div className="ce-mobile-nav-head">
            <div className="ce-mobile-nav-kicker">NAVEGAÇÃO</div>
            <a href="#conteudo" className="ce-mobile-menu-close" aria-label="Fechar menu">×</a>
          </div>

          <a href="#como-usar">Como funciona <Icon name="arrow" size={15}/></a>
          <a href="#recursos">Recursos <Icon name="arrow" size={15}/></a>
          <a href="#planos">Planos <Icon name="arrow" size={15}/></a>
          <a href="#faq">Dúvidas frequentes <Icon name="arrow" size={15}/></a>

          <div className="ce-mobile-nav-actions">
            <a href="/login">Entrar no portal</a>
            <a href="/cadastro" className="primary">
              Criar minha loja <Icon name="arrow" size={15}/>
            </a>
          </div>
        </nav>
      </div>
    </header>
  )
}
