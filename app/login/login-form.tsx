'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { loginAction, type LoginState } from './actions'

const initialState: LoginState = {}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState)

  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="loja@exemplo.com" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
        <Link href="/forgot-password" className="subtle" style={{ color: 'var(--gold)', fontWeight: 800 }}>
          Esqueci minha senha
        </Link>
      </div>
      <button className="button button-gold" disabled={pending}>
        {pending ? 'ENTRANDO...' : 'ENTRAR NO PAINEL'}
      </button>
      {state.error ? <div className="error">{state.error}</div> : null}

      <div className="login-signup-cta">
        <span>Ainda não usa o ChamaEntrega?</span>
        <Link href="/cadastro">Criar minha loja</Link>
      </div>
    </form>
  )
}
