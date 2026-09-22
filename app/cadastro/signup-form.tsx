'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signupStoreAction, type SignupState } from './actions'

const initialState: SignupState = {}

export function SignupStoreForm() {
  const [state,action,pending] = useActionState(signupStoreAction,initialState)

  return (
    <form action={action} className="signup-store-form">
      <div className="signup-grid">
        <label className="field">
          <span>Nome do responsável</span>
          <input
            name="full_name"
            autoComplete="name"
            placeholder="Ex.: João da Silva"
            required
          />
        </label>

        <label className="field">
          <span>Telefone</span>
          <input
            name="phone"
            autoComplete="tel"
            placeholder="(21) 99999-9999"
          />
        </label>

        <label className="field full">
          <span>E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@sualoja.com.br"
            required
          />
        </label>

        <label className="field">
          <span>Senha</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 10 caracteres"
            minLength={10}
            required
          />
        </label>

        <label className="field">
          <span>Confirmar senha</span>
          <input
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            placeholder="Repita sua senha"
            minLength={10}
            required
          />
        </label>
      </div>

      <label className="signup-consent">
        <input type="checkbox" name="consent" value="accepted" required/>
        <span>
          Concordo em criar uma conta comercial no ChamaEntrega e aceito que os dados
          da minha loja sejam usados para operar as entregas.
        </span>
      </label>

      <button className="button button-gold signup-submit" disabled={pending}>
        {pending ? 'CRIANDO SUA CONTA...' : 'CRIAR MINHA CONTA'}
      </button>

      {state.error ? <div className="error">{state.error}</div> : null}
      {state.success ? <div className="signup-success">{state.success}</div> : null}

      <p className="signup-login-link">
        Já tem uma conta? <Link href="/login">Entrar no ChamaEntrega</Link>
      </p>
    </form>
  )
}
