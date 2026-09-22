'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setMessage('')
    setError('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || normalizedEmail.length > 254) {
      setSending(false)
      setError('Informe um e-mail válido.')
      return
    }

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })

    setSending(false)
    if (resetError) {
      setError('Não foi possível enviar o link agora. Aguarde um momento e tente novamente.')
      return
    }

    setMessage('Enviamos um link de recuperação para o seu e-mail. Abra a mensagem e clique no link para criar uma nova senha.')
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">E-mail da conta</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
          required
        />
      </div>
      <button className="button button-gold" disabled={sending}>
        {sending ? 'ENVIANDO...' : 'ENVIAR LINK DE RECUPERAÇÃO'}
      </button>
      {message ? <div className="notice" style={{ marginTop: 12 }}>{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link href="/login" className="subtle">Voltar para o login</Link>
      </div>
    </form>
  )
}
