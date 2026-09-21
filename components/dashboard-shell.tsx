'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setActiveStoreAction, signOutAction } from '@/app/actions'
import { Icon } from '@/components/icon'
import { StoreLogoUpload } from '@/components/store-logo-upload'

const nav = [
  ['/painel', 'Visão Geral', 'home'],
  ['/pedidos', 'Pedidos', 'box'],
  ['/entregas/nova', 'Criar entrega', 'plus'],
  ['/despacho', 'Despacho Inteligente', 'route'],
  ['/entregas', 'Entregas', 'box'],
  ['/entregadores', 'Entregadores', 'user'],
  ['/mapa', 'Mapa ao vivo', 'map'],
  ['/chat', 'Chat', 'chat'],
  ['/financeiro', 'Financeiro', 'chart'],
  ['/integracoes', 'Integrações', 'link'],
  ['/configuracoes', 'Configurações', 'gear'],
]

type StoreOption = {
  id: string
  name: string
  logo_url: string | null
  is_active: boolean
  city: string | null
  state: string | null
}

type Props = {
  storeId: string
  userId: string
  role: string
  stores: StoreOption[]
  storeName: string
  storeActive: boolean
  storeLogoUrl: string | null
  children: React.ReactNode
}

export function DashboardShell({
  storeId,
  userId,
  role,
  stores,
  storeName,
  storeActive,
  storeLogoUrl,
  children,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [storeMenuOpen,setStoreMenuOpen] = useState(false)
  const [switchingStore,startStoreTransition] = useTransition()

  useEffect(() => {
    const saved = window.localStorage.getItem('chamaentrega-theme')
    const theme = saved === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [])

  function switchStore(nextStoreId:string) {
    if (nextStoreId === storeId || switchingStore) {
      setStoreMenuOpen(false)
      return
    }

    startStoreTransition(async () => {
      const result = await setActiveStoreAction(nextStoreId)
      if (result.ok) {
        setStoreMenuOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="shell premium-shell">
      <aside className="sidebar premium-sidebar">
        <Link href="/painel" className="brand premium-brand official-brand-link" aria-label="ChamaEntrega — Chamou, Chegou">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            alt="ChamaEntrega — Chamou, Chegou"
            className="official-brand-logo"
          />
        </Link>

        <div className="store-switcher">
          <div className="store-chip premium-store-chip store-switcher-trigger">
            <span className="store-switcher-logo-wrap">
              <StoreLogoUpload
                storeId={storeId}
                userId={userId}
                storeName={storeName}
                logoUrl={storeLogoUrl}
                variant="sidebar"
              />
            </span>

            <button
              type="button"
              className="store-switcher-selector"
              onClick={() => setStoreMenuOpen(open => !open)}
              aria-expanded={storeMenuOpen}
              aria-label="Escolher loja ativa"
            >
              <span className="store-copy">
                <strong>{storeName}</strong>
                <small><i />{storeActive ? 'Loja ativa' : 'Loja inativa'}</small>
              </span>
              <span className={storeMenuOpen ? 'store-chevron open' : 'store-chevron'}>⌄</span>
            </button>
          </div>

          {storeMenuOpen ? (
            <div className="store-switcher-menu">
              <div className="store-switcher-head">
                <div>
                  <small>OPERAÇÃO ATIVA</small>
                  <strong>Escolher loja</strong>
                </div>
                <span>{stores.length}</span>
              </div>

              <div className="store-switcher-list">
                {stores.map(store => (
                  <button
                    key={store.id}
                    type="button"
                    className={store.id === storeId ? 'active' : ''}
                    onClick={() => switchStore(store.id)}
                    disabled={switchingStore}
                  >
                    <span className="store-switcher-avatar">
                      {store.logo_url
                        ? <img src={store.logo_url} alt="" />
                        : store.name.slice(0,1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{store.name}</strong>
                      <small>
                        {store.city && store.state
                          ? `${store.city} · ${store.state}`
                          : store.is_active ? 'Loja ativa' : 'Loja inativa'}
                      </small>
                    </span>
                    <em>{store.id === storeId ? '✓' : '›'}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
            <span><strong>Minha conta</strong><small>Administrador da loja</small></span>
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
              <span><strong>{storeName}</strong><small>Administrador da loja</small></span>
              <span>⌄</span>
            </div>
          </div>
        </header>
        <div className="content premium-content">{children}</div>
      </section>

      <nav className="mobile-nav">
        <Link href="/painel"><Icon name="home" size={18}/>Início</Link>
        <Link href="/pedidos"><Icon name="box" size={18}/>Pedidos</Link>
        <Link href="/entregas"><Icon name="box" size={18}/>Entregas</Link>
        <Link href="/mapa"><Icon name="map" size={18}/>Mapa</Link>
        <Link href="/financeiro"><Icon name="chart" size={18}/>Financeiro</Link>
      </nav>
    </div>
  )
}
