'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type PixCharge = {
  topupId: string
  correlationId: string
  amount: number
  brCode?: string | null
  qrCodeImageUrl?: string | null
  paymentLinkUrl?: string | null
  expiresAt?: string | null
  status: string
}

const presets = [50, 100, 200, 500]

export function WalletTopup({ storeId }: { storeId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [amount, setAmount] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [charge, setCharge] = useState<PixCharge | null>(null)
  const [copied, setCopied] = useState(false)

  const numericAmount = useMemo(() => {
    const value = Number(amount.replace(',', '.'))
    return Number.isFinite(value) ? value : 0
  }, [amount])

  useEffect(() => {
    const channel = supabase
      .channel('wallet-topups:' + storeId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'store_wallet_topups',
          filter: 'store_id=eq.' + storeId,
        },
        payload => {
          const row = payload.new as any
          if (!charge || row.id !== charge.topupId) return

          setCharge(current => current ? { ...current,status:String(row.status ?? current.status) } : current)

          if (row.status === 'paid') {
            router.refresh()
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [charge,router,storeId,supabase])

  useEffect(() => {
    if (!charge || charge.status === 'paid') return

    const poll = window.setInterval(async () => {
      const { data } = await supabase
        .from('store_wallet_topups')
        .select('status,paid_at')
        .eq('id',charge.topupId)
        .eq('store_id',storeId)
        .maybeSingle()

      if (!data) return

      setCharge(current => current ? { ...current,status:String(data.status ?? current.status) } : current)

      if (data.status === 'paid') {
        window.clearInterval(poll)
        router.refresh()
      }
    },5000)

    return () => window.clearInterval(poll)
  }, [charge,router,storeId,supabase])

  async function createCharge() {
    setLoading(true)
    setError('')
    setCharge(null)

    const { data, error: invokeError } = await supabase.functions.invoke('create-wallet-topup', {
      body: { storeId, amount: numericAmount },
    })

    setLoading(false)

    if (invokeError) {
      let message = invokeError.message || 'Não foi possível criar a cobrança Pix.'

      const context = (invokeError as any)?.context
      if (context instanceof Response) {
        try {
          const payload = await context.clone().json()
          if (payload?.error) message = String(payload.error)
          else if (payload?.message) message = String(payload.message)
        } catch {
          try {
            const body = await context.clone().text()
            if (body) message = body
          } catch {}
        }
      }

      setError(message)
      return
    }

    if (data?.error) {
      setError(String(data.error))
      return
    }

    setCharge(data as PixCharge)
  }

  async function copyPix() {
    if (!charge?.brCode) return
    await navigator.clipboard.writeText(charge.brCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="wallet-topup-card">
      <div className="wallet-section-head">
        <div>
          <span className="eyebrow">Adicionar saldo</span>
          <h2>Recarregar via Pix</h2>
          <p>O saldo só é liberado depois da confirmação do pagamento.</p>
        </div>
      </div>

      <div className="wallet-presets">
        {presets.map(value => (
          <button
            type="button"
            key={value}
            className={numericAmount === value ? 'active' : ''}
            onClick={() => setAmount(String(value))}
          >
            R$ {value}
          </button>
        ))}
      </div>

      <div className="wallet-custom-amount">
        <span>R$</span>
        <input
          value={amount}
          onChange={event => setAmount(event.target.value)}
          inputMode="decimal"
          aria-label="Valor da recarga"
        />
        <button
          type="button"
          className="button button-gold"
          onClick={createCharge}
          disabled={loading || numericAmount <= 0}
        >
          {loading ? 'GERANDO PIX...' : 'GERAR PIX'}
        </button>
      </div>

      {error ? <div className="error wallet-error">{error}</div> : null}

      {charge ? (
        <div className="pix-charge-result">
          <div className="pix-charge-title">
            <strong>Pix de R$ {Number(charge.amount).toFixed(2).replace('.', ',')}</strong>
            <span className={charge.status === 'paid' ? 'paid' : ''}>
              {charge.status === 'paid' ? 'Pagamento confirmado ✓' : 'Aguardando pagamento'}
            </span>
          </div>

          {charge.qrCodeImageUrl ? (
            <img src={charge.qrCodeImageUrl} className="pix-qr" alt="QR Code Pix da recarga" />
          ) : null}

          {charge.brCode ? (
            <>
              <textarea readOnly value={charge.brCode} className="pix-code" />
              <button type="button" className="button button-dark" onClick={copyPix}>
                {copied ? 'PIX COPIADO ✓' : 'COPIAR PIX COPIA E COLA'}
              </button>
            </>
          ) : null}

          {charge.paymentLinkUrl ? (
            <a href={charge.paymentLinkUrl} target="_blank" rel="noreferrer" className="wallet-payment-link">
              Abrir página de pagamento ↗
            </a>
          ) : null}

          <p className="wallet-security-note">
            {charge.status === 'paid'
              ? 'Pagamento confirmado. O saldo já foi atualizado na carteira.'
              : 'Esta tela acompanha a confirmação automaticamente. Assim que a Woovi confirmar o Pix, o saldo será atualizado sem você precisar recarregar a página.'}
          </p>
        </div>
      ) : null}
    </section>
  )
}
