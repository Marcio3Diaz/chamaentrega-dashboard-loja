'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password.length < 10 || password.length > 128) {
      setError('A nova senha deve ter entre 10 e 128 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()

    if (claimsError || !claimsData?.claims) {
      setSaving(false)
      setError('O link de recuperação expirou ou não é válido. Solicite um novo link.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSaving(false)
      setError('Não foi possível atualizar a senha. Solicite um novo link e tente novamente.')
      return
    }

    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="password">Nova senha</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirmar nova senha</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
      </div>
      <button className="button button-gold" disabled={saving}>
        {saving ? 'SALVANDO...' : 'SALVAR NOVA SENHA'}
      </button>
      {error ? <div className="error">{error}</div> : null}
    </form>
  )
}
