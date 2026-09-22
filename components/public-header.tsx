'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icon'

export function PublicHeader() {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus()
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

      if (focusable.length === 0) {
        event.preventDefault()
        menuButtonRef.current?.focus({ preventScroll:true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement

      if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      window.setTimeout(() => {
        menuButtonRef.current?.focus({ preventScroll:true })
      }, 0)
    }
  }, [open])

  const closeMenu = () => setOpen(false)

  return (
    <header className="ce-header">
      <Link href="/" prefetch={false} className="ce-logo" aria-label="ChamaEntrega" onClick={closeMenu}>
        <Image
          src="/brand/chamaentrega-logo-official.webp"
          alt="ChamaEntrega"
          width={176}
          height={59}
          sizes="(max-width: 620px) 155px, 176px"
          priority
        />
      </Link>

      <nav className="ce-desktop-nav" aria-label="Navegação principal">
        <a href="#como-usar">Como funciona</a>
        <a href="#recursos">Recursos</a>
        <a href="#planos">Planos</a>
        <a href="#faq">FAQ</a>
      </nav>

      <div className="ce-header-actions">
        <Link href="/login" prefetch={false} className="ce-link-button">
          Entrar
        </Link>
        <Link href="/cadastro" prefetch={false} className="ce-primary-button">
          Criar minha loja <Icon name="arrow" size={15}/>
        </Link>
      </div>

      <button
        ref={menuButtonRef}
        type="button"
        className={`ce-mobile-menu-button ${open ? 'is-open' : ''}`}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        aria-controls="ce-mobile-nav"
        onClick={() => setOpen(value => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      {open ? (
        <div className="ce-mobile-menu-layer" onMouseDown={closeMenu}>
          <nav
            ref={menuRef}
            id="ce-mobile-nav"
            className="ce-mobile-nav"
            aria-label="Menu mobile"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="ce-mobile-nav-kicker">NAVEGAÇÃO</div>
            <a href="#como-usar" onClick={closeMenu}>Como funciona <Icon name="arrow" size={15}/></a>
            <a href="#recursos" onClick={closeMenu}>Recursos <Icon name="arrow" size={15}/></a>
            <a href="#planos" onClick={closeMenu}>Planos <Icon name="arrow" size={15}/></a>
            <a href="#faq" onClick={closeMenu}>Dúvidas frequentes <Icon name="arrow" size={15}/></a>

            <div className="ce-mobile-nav-actions">
              <Link href="/login" prefetch={false} onClick={closeMenu}>Entrar no portal</Link>
              <Link href="/cadastro" prefetch={false} className="primary" onClick={closeMenu}>
                Criar minha loja <Icon name="arrow" size={15}/>
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
