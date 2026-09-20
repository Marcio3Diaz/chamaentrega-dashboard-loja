'use client'

import { useMemo, useState } from 'react'
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
  const [amount, setAmount] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [charge, setCharge] = useState<PixCharge | null>(null)
  const [copied, setCopied] = useState(false)

  const numericAmount = useMemo(() => {
    const value = Number(amount.replace(',', '.'))
    return Number.isFinite(value) ? value : 0
  }, [amount])

  async function createCharge() {
    setLoading(true)
    setError('')
    setCharge(null)

    const supabase = createClient()
    const { data, error: invokeError } = await supabase.functions.invoke('create-wallet-topup', {
      body: { storeId, amount: numericAmount },
    })

    setLoading(false)

    if (invokeError) {
      setError(invokeError.message || 'Não foi possível criar a cobrança Pix.')
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
            <span>Aguardando pagamento</span>
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
            Assim que a Woovi confirmar o Pix, o saldo entra automaticamente na carteira.
          </p>
        </div>
      ) : null}
    </section>
  )
}
