'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setActiveStoreAction, signOutAction } from '@/app/actions'
import { Icon } from '@/components/icon'
import { StoreLogoUpload } from '@/components/store-logo-upload'
import { CHAMAENTREGA_LOGO_CREME } from '@/lib/brand-logo-creme'

const nav = [
  ['/painel', 'Início', 'home'],
  ['/pedidos', 'Pedidos', 'box'],
  ['/entregas/nova', 'Criar entrega', 'route'],
  ['/entregadores', 'Entregadores', 'user'],
  ['/financeiro', 'Financeiro', 'chart'],
  ['/entregas', 'Entregas', 'box'],
  ['/integracoes', 'Cardápio', 'store'],
  ['/integracoes', 'Integrações', 'link'],
  ['/despacho', 'Promoções', 'activity'],
  ['/configuracoes', 'Configurações', 'gear'],
]

type StoreOption = {
  id: string
  name: string
  logo_url: string | null
  is_active: boolean
  moderation_status: 'pending' | 'active' | 'suspended' | 'banned' | 'rejected'
  city: string | null
  state: string | null
}

type Props = {
  storeId: string
  userId: string
  stores: StoreOption[]
  storeName: string
  storeActive: boolean
  moderationStatus: 'pending' | 'active' | 'suspended' | 'banned' | 'rejected'
  moderationReason: string | null
  storeLogoUrl: string | null
  walletAvailable: number
  children: React.ReactNode
}

export function DashboardShell({
  storeId,
  userId,
  stores,
  storeName,
  storeActive,
  moderationStatus,
  moderationReason,
  storeLogoUrl,
  walletAvailable,
  children,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [storeMenuOpen,setStoreMenuOpen] = useState(false)
  const [searchValue,setSearchValue] = useState('')
  const [switchingStore,startStoreTransition] = useTransition()

  useEffect(() => {
    const saved = window.localStorage.getItem('chamaentrega-theme')
    const theme = saved === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [])

  const moderationLabel = {
    pending:'Aguardando aprovação',
    active:storeActive ? 'Loja ativa' : 'Loja pausada',
    suspended:'Loja suspensa',
    banned:'Loja banida',
    rejected:'Cadastro rejeitado',
  }[moderationStatus]

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
            src={(pathname.startsWith('/pedidos') || pathname.startsWith('/entregadores') || pathname === '/entregas' || pathname === '/painel') ? CHAMAENTREGA_LOGO_CREME : '/brand/chamaentrega-logo-official.webp'}
            width={420}
            height={140}
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
                <small><i />{moderationLabel}</small>
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
                          : store.moderation_status === 'pending'
                            ? 'Aguardando aprovação'
                            : store.moderation_status === 'suspended'
                              ? 'Loja suspensa'
                              : store.moderation_status === 'banned'
                                ? 'Loja banida'
                                : store.moderation_status === 'rejected'
                                  ? 'Cadastro rejeitado'
                                  : store.is_active ? 'Loja ativa' : 'Loja pausada'}
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
        <header className="topbar premium-topbar reference-topbar">
          <div className="reference-search">
            <Icon name="search" size={18}/>
            <input
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && searchValue.trim()) {
                  router.push('/pedidos')
                }
              }}
              placeholder="Buscar pedidos, clientes, entregadores..."
              aria-label="Buscar no painel"
            />
            <kbd>Ctrl + K</kbd>
          </div>

          <div className="topbar-actions reference-topbar-actions">
            <Link href="/pedidos" className="icon-button notification-button reference-bell" aria-label="Abrir pedidos">
              <Icon name="bell" size={21}/><i />
            </Link>

            <Link href="/financeiro" className="reference-wallet-chip">
              <span className="reference-wallet-icon"><Icon name="money" size={18}/></span>
              <span><strong>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(walletAvailable)}</strong><small>Saldo na carteira</small></span>
            </Link>

            <Link href="/entregas/nova" className="reference-new-delivery">
              <Icon name="plus" size={20}/>
              <span>Nova entrega</span>
            </Link>

            <button
              type="button"
              className="reference-store-profile"
              onClick={() => setStoreMenuOpen(open => !open)}
              aria-expanded={storeMenuOpen}
            >
              <span className="reference-profile-logo">
                {storeLogoUrl ? (
                  <img src={storeLogoUrl} alt="" />
                ) : (
                  <span className="reference-profile-fallback">{storeName.slice(0,1).toUpperCase()}</span>
                )}
              </span>
              <span><strong>{storeName}</strong><small><i />{moderationStatus === 'active' ? 'Loja ativa' : moderationLabel}</small></span>
              <Icon name="chevron" size={16}/>
            </button>
          </div>
        </header>
        <div className="content premium-content">
          {moderationStatus !== 'active' ? (
            <div className={`store-moderation-banner ${moderationStatus}`}>
              <span><Icon name="shield" size={20}/></span>
              <div>
                <strong>{moderationLabel}</strong>
                <small>
                  {moderationReason ||
                    (moderationStatus === 'pending'
                      ? 'Seu cadastro foi recebido e está aguardando aprovação da equipe ChamaEntrega.'
                      : 'A operação desta loja está bloqueada administrativamente.')}
                </small>
              </div>
            </div>
          ) : null}
          {children}
        </div>
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
