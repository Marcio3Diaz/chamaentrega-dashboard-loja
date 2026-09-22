'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Enrollment = {
  id:string
  qrCode:string
  secret:string
}

export function AdminMfaSetup() {
  const router = useRouter()
  const started = useRef(false)
  const [enrollment,setEnrollment] = useState<Enrollment | null>(null)
  const [code,setCode] = useState('')
  const [loading,setLoading] = useState(true)
  const [verifying,setVerifying] = useState(false)
  const [error,setError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false

    async function enroll() {
      const supabase = createClient()

      const { data:assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance?.currentLevel === 'aal2') {
        router.replace('/admin')
        router.refresh()
        return
      }

      const { data:factors,error:factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) {
        if (!cancelled) {
          setError('Não foi possível verificar os fatores de segurança da conta.')
          setLoading(false)
        }
        return
      }

      const verified = factors?.totp?.find(item => item.status === 'verified')
      if (verified) {
        router.replace('/admin/mfa')
        return
      }

      const unverified = factors?.totp?.filter(item => item.status === 'unverified') ?? []
      for (const factor of unverified) {
        await supabase.auth.mfa.unenroll({ factorId:factor.id })
      }

      const { data,error:enrollError } = await supabase.auth.mfa.enroll({
        factorType:'totp',
        friendlyName:'Central ChamaEntrega',
      })

      if (cancelled) return

      if (enrollError || !data?.totp) {
        setError('Não foi possível iniciar o cadastro do autenticador.')
        setLoading(false)
        return
      }

      setEnrollment({
        id:data.id,
        qrCode:data.totp.qr_code,
        secret:data.totp.secret,
      })
      setLoading(false)
    }

    void enroll()
    return () => { cancelled = true }
  }, [router])

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const cleanCode = code.replace(/\D/g,'').slice(0,6)
    if (!enrollment || cleanCode.length !== 6) {
      setError('Digite o código de 6 dígitos exibido no seu autenticador.')
      return
    }

    setVerifying(true)
    const supabase = createClient()
    const { error:verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId:enrollment.id,
      code:cleanCode,
    })

    if (verifyError) {
      setVerifying(false)
      setError('O código não foi aceito. Confira o relógio do celular e tente novamente.')
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
    return <div className="admin-mfa-loading">Gerando seu autenticador...</div>
  }

  if (!enrollment) {
    return (
      <div className="admin-mfa-form">
        {error ? <div className="admin-mfa-error" role="alert">{error}</div> : null}
        <button type="button" className="admin-mfa-secondary" onClick={signOut}>
          Sair da conta
        </button>
      </div>
    )
  }

  return (
    <form className="admin-mfa-form" onSubmit={confirm}>
      <div className="admin-mfa-qr-wrap">
        <img src={enrollment.qrCode} alt="QR Code para configurar o autenticador" />
      </div>

      <div className="admin-mfa-manual">
        <span>Não consegue escanear?</span>
        <strong>{enrollment.secret}</strong>
        <small>Cadastre esta chave manualmente como TOTP no aplicativo autenticador.</small>
      </div>

      <label htmlFor="admin-mfa-setup-code">Código gerado pelo aplicativo</label>
      <input
        id="admin-mfa-setup-code"
        value={code}
        onChange={event => setCode(event.target.value.replace(/\D/g,'').slice(0,6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        required
      />

      <button type="submit" className="admin-mfa-primary" disabled={verifying}>
        {verifying ? 'ATIVANDO...' : 'ATIVAR E ENTRAR NA CENTRAL'}
      </button>

      {error ? <div className="admin-mfa-error" role="alert">{error}</div> : null}

      <button type="button" className="admin-mfa-secondary" onClick={signOut}>
        Cancelar e sair
      </button>
    </form>
  )
}
