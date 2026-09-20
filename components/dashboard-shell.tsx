'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '@/app/actions'

const nav = [
  ['/', 'Visão Geral'],
  ['/entregas/nova', 'Criar entrega'],
  ['/entregas', 'Entregas'],
  ['/entregadores', 'Entregadores'],
  ['/financeiro', 'Financeiro'],
  ['/integracoes', 'Integrações'],
  ['/configuracoes', 'Configurações'],
]

export function DashboardShell({ storeName, storeActive, children }: { storeName: string; storeActive: boolean; children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand"><span className="brand-mark">CE</span><span>ChamaEntrega</span></Link>
        <div className="store-chip"><strong>{storeName}</strong><small>{storeActive ? 'Loja ativa' : 'Loja inativa'}</small></div>
        <nav className="nav">
          {nav.map(([href,label]) => <Link key={href} href={href} className={pathname===href ? 'primary' : ''}>{label}</Link>)}
        </nav>
        <div className="sidebar-foot"><form action={signOutAction}><button className="signout">Sair da conta</button></form></div>
      </aside>
      <section className="main">
        <header className="topbar"><div className="topbar-title">Portal da Loja</div><div className="online-pill"><span className="online-dot" />Sistema online</div></header>
        <div className="content">{children}</div>
      </section>
      <nav className="mobile-nav">
        <Link href="/">Início</Link><Link href="/entregas/nova">Criar</Link><Link href="/entregas">Entregas</Link><Link href="/financeiro">Financeiro</Link>
      </nav>
    </div>
  )
}
