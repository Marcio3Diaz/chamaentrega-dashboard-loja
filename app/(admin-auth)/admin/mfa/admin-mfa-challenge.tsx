'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AdminMfaChallenge() {
  const router = useRouter()
  const [factorId,setFactorId] = useState('')
  const [code,setCode] = useState('')
  const [loading,setLoading] = useState(true)
  const [verifying,setVerifying] = useState(false)
  const [error,setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function prepare() {
      const supabase = createClient()
      const { data:assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      if (assurance?.currentLevel === 'aal2') {
        router.replace('/admin')
        router.refresh()
        return
      }

      const { data,error:factorsError } = await supabase.auth.mfa.listFactors()

      if (cancelled) return

      if (factorsError) {
        setError('Não foi possível carregar a verificação em duas etapas.')
        setLoading(false)
        return
      }

      const factor = data?.totp?.find(item => item.status === 'verified')

      if (!factor) {
        router.replace('/admin/mfa/setup')
        return
      }

      setFactorId(factor.id)
      setLoading(false)
    }

    void prepare()
    return () => { cancelled = true }
  }, [router])

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const cleanCode = code.replace(/\D/g,'').slice(0,6)
    if (cleanCode.length !== 6 || !factorId) {
      setError('Digite o código de 6 dígitos do autenticador.')
      return
    }

    setVerifying(true)
    const supabase = createClient()
    const { error:verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code:cleanCode,
    })

    if (verifyError) {
      setVerifying(false)
      setError('Código inválido ou expirado. Aguarde o próximo código e tente novamente.')
      return
    }

    router.replace('/admin')
    router.refresh()
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/admin/login')
    router.refresh()
  }

  if (loading) {
    return <div className="admin-mfa-loading">Preparando verificação segura...</div>
  }

  return (
    <form className="admin-mfa-form" onSubmit={verify}>
      <label htmlFor="admin-mfa-code">Código do autenticador</label>
      <input
        id="admin-mfa-code"
        name="code"
        value={code}
        onChange={event => setCode(event.target.value.replace(/\D/g,'').slice(0,6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        autoFocus
        required
      />

      <button type="submit" className="admin-mfa-primary" disabled={verifying}>
        {verifying ? 'VERIFICANDO...' : 'CONFIRMAR E ENTRAR'}
      </button>

      {error ? <div className="admin-mfa-error" role="alert">{error}</div> : null}

      <button type="button" className="admin-mfa-secondary" onClick={signOut}>
        Sair e usar outra conta
      </button>
    </form>
  )
}
