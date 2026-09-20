'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '@/app/actions'
import { Icon } from '@/components/icon'
import { StoreLogoUpload } from '@/components/store-logo-upload'

const nav = [
  ['/', 'Visão Geral', 'home'],
  ['/entregas/nova', 'Criar entrega', 'plus'],
  ['/entregas', 'Entregas', 'box'],
  ['/entregadores', 'Entregadores', 'user'],
  ['/financeiro', 'Financeiro', 'chart'],
  ['/integracoes', 'Integrações', 'link'],
  ['/configuracoes', 'Configurações', 'gear'],
]

type Props = {
  storeId: string
  userId: string
  storeName: string
  storeActive: boolean
  storeLogoUrl: string | null
  children: React.ReactNode
}

export function DashboardShell({
  storeId,
  userId,
  storeName,
  storeActive,
  storeLogoUrl,
  children,
}: Props) {
  const pathname = usePathname()

  return (
    <div className="shell premium-shell">
      <aside className="sidebar premium-sidebar">
        <Link href="/" className="brand premium-brand">
          <span className="brand-word">Chama<span>Entrega</span></span>
          <small>ENTREGADOR</small>
        </Link>

        <div className="store-chip premium-store-chip">
          <StoreLogoUpload
            storeId={storeId}
            userId={userId}
            storeName={storeName}
            logoUrl={storeLogoUrl}
            variant="sidebar"
          />
          <span className="store-copy"><strong>{storeName}</strong><small><i />{storeActive ? 'Loja ativa' : 'Loja inativa'}</small></span>
          <span className="store-chevron">⌄</span>
        </div>

        <nav className="nav premium-nav">
          {nav.map(([href,label,icon]) => (
            <Link key={href} href={href} className={pathname===href ? 'primary' : ''}>
              <span className="nav-icon"><Icon name={icon} size={19}/></span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="account-box">
            <span className="account-avatar">{storeName.slice(0,1).toUpperCase()}</span>
            <span><strong>Minha conta</strong><small>Administrador</small></span>
          </div>
          <form action={signOutAction}><button className="signout">↪&nbsp; Sair da conta</button></form>
        </div>
      </aside>

      <section className="main premium-main">
        <header className="topbar premium-topbar">
          <div>
            <div className="topbar-title">Portal da Loja</div>
            <div className="topbar-subtitle">Seu centro de controle de entregas</div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button notification-button" aria-label="Notificações"><Icon name="bell" size={21}/><i /></button>
            <span className="topbar-divider" />
            <div className="online-pill"><span className="online-dot" />Sistema online</div>
            <span className="topbar-divider" />
            <div className="topbar-profile">
              <StoreLogoUpload
                storeId={storeId}
                userId={userId}
                storeName={storeName}
                logoUrl={storeLogoUrl}
                variant="topbar"
              />
              <span><strong>{storeName}</strong><small>Administrador</small></span>
              <span>⌄</span>
            </div>
          </div>
        </header>
        <div className="content premium-content">{children}</div>
      </section>

      <nav className="mobile-nav">
        <Link href="/"><Icon name="home" size={18}/>Início</Link>
        <Link href="/entregas/nova"><Icon name="plus" size={18}/>Criar</Link>
        <Link href="/entregas"><Icon name="box" size={18}/>Entregas</Link>
        <Link href="/financeiro"><Icon name="chart" size={18}/>Financeiro</Link>
      </nav>
    </div>
  )
}
