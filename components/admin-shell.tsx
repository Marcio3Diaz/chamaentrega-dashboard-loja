'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminSignOutAction } from '@/app/(admin-auth)/admin/login/actions'
import { Icon } from '@/components/icon'

const nav = [
  ['/admin','Visão geral','home'],
  ['/admin/lojas','Lojas','store'],
  ['/admin/entregadores','Entregadores','user'],
  ['/admin/corridas','Corridas','route'],
  ['/admin/financeiro','Financeiro','chart'],
  ['/admin/usuarios','Usuários','users'],
]

export function AdminShell({
  fullName,
  children,
}:{
  fullName:string
  children:React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="admin-shell admin-shell-modern">
      <aside className="admin-sidebar">
        <Link href="/admin" className="admin-brand">
          <img
            src="/brand/chamaentrega-logo-official.webp"
            alt="ChamaEntrega"
          />
          <span>ADMIN</span>
        </Link>

        <div className="admin-nav-label">PLATAFORMA</div>
        <nav className="admin-nav">
          {nav.map(([href,label,icon]) => {
            const active = href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(href)

            return (
              <Link key={href} href={href} className={active ? 'active' : ''}>
                <span><Icon name={icon} size={18}/></span>
                <strong>{label}</strong>
              </Link>
            )
          })}
        </nav>

        <div className="admin-sidebar-spacer"/>

        <div className="admin-account">
          <div className="admin-account-avatar">
            {fullName.slice(0,1).toUpperCase()}
          </div>
          <div>
            <strong>{fullName}</strong>
            <small>Administrador da plataforma</small>
          </div>
        </div>

        <form action={adminSignOutAction}>
          <button className="admin-signout">
            <Icon name="arrow" size={15}/> Sair
          </button>
        </form>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <strong>Central ChamaEntrega</strong>
            <span>Administração geral da plataforma</span>
          </div>

          <div className="admin-topbar-actions">
            <div className="admin-system-status">
              <i/> Plataforma online
            </div>

            <Link href="/" className="admin-site-link">
              Ver site
              <Icon name="arrow" size={13}/>
            </Link>

            <button className="admin-topbar-bell" type="button" aria-label="Notificações">
              <Icon name="bell" size={18}/>
              <i/>
            </button>

            <div className="admin-topbar-user">
              <span className="admin-topbar-avatar">
                {fullName.slice(0,1).toUpperCase()}
              </span>
              <span className="admin-topbar-user-copy">
                <strong>{fullName}</strong>
                <small>Administrador</small>
              </span>
              <Icon name="chevron" size={15}/>
            </div>
          </div>
        </header>

        <div className="admin-content">
          {children}
        </div>
      </section>
    </div>
  )
}
