'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import {
  adminLoginAction,
  type AdminLoginState,
} from './actions'

const initialState: AdminLoginState = {}

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(
    adminLoginAction,
    initialState,
  )

  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="admin-email">E-mail</label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          placeholder="admin@chamaentrega.com.br"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="admin-password">Senha</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          placeholder="••••••••"
          required
        />
      </div>

      <div style={{
        display:'flex',
        justifyContent:'flex-end',
        marginTop:-4,
      }}>
        <Link
          href="/forgot-password"
          className="subtle"
          style={{ color:'var(--gold)',fontWeight:800 }}
        >
          Esqueci minha senha
        </Link>
      </div>

      <button className="button button-gold" disabled={pending}>
        {pending ? 'ENTRANDO...' : 'ENTRAR NA CENTRAL'}
      </button>

      {state.error ? <div className="error">{state.error}</div> : null}
    </form>
  )
}
