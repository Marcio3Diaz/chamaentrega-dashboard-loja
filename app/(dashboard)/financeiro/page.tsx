import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { currency } from '@/lib/format'
import { WalletTopup } from './wallet-topup'

const typeLabels: Record<string,string> = {
  deposit: 'Recarga via Pix',
  delivery_payment: 'Pagamento de entrega',
  refund: 'Reembolso',
  withdrawal: 'Saque',
  adjustment: 'Ajuste',
  bonus: 'Bônus',
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default async function FinancePage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const [{ data: walletRows }, { data: transactions }, { data: topups }, { data: reservations }] = await Promise.all([
    supabase.rpc('get_my_store_wallet', { p_store_id: store.id }),
    supabase.rpc('get_my_store_wallet_transactions', { p_store_id: store.id, p_limit: 30, p_offset: 0 }),
    supabase
      .from('store_wallet_topups')
      .select('id,amount,status,created_at,paid_at,expires_at')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('store_wallet_reservations')
      .select('id,amount,status,delivery_id,created_at')
      .eq('store_id', store.id)
      .eq('status', 'reserved')
      .order('created_at', { ascending: false }),
  ])

  const wallet = walletRows?.[0] ?? {
    balance: 0,
    reserved_balance: 0,
    available_balance: 0,
    pending_credits: 0,
    pending_debits: 0,
  }

  const balance = Number(wallet.balance ?? 0)
  const reserved = Number(wallet.reserved_balance ?? 0)
  const available = Number(wallet.available_balance ?? Math.max(balance - reserved, 0))
  const pendingCredits = Number(wallet.pending_credits ?? 0)
  const activeReservations = reservations ?? []
  const recentTransactions = transactions ?? []
  const pendingTopups = (topups ?? []).filter(item => item.status === 'pending')

  return (
    <div className="wallet-page">
      <section className="wallet-page-hero">
        <div>
          <div className="eyebrow">CARTEIRA PRÉ-PAGA</div>
          <h1>Financeiro</h1>
          <p>Adicione saldo por Pix e use a carteira para pagar suas entregas automaticamente.</p>
        </div>
        <div className="wallet-shield">CE</div>
      </section>

      <section className="wallet-balance-grid">
        <article className="wallet-balance-card primary">
          <span>Saldo disponível</span>
          <strong>{currency(available)}</strong>
          <small>Pronto para novas entregas</small>
        </article>
        <article className="wallet-balance-card">
          <span>Saldo reservado</span>
          <strong>{currency(reserved)}</strong>
          <small>{activeReservations.length} entrega{activeReservations.length === 1 ? '' : 's'} com valor reservado</small>
        </article>
        <article className="wallet-balance-card">
          <span>Saldo total</span>
          <strong>{currency(balance)}</strong>
          <small>Disponível + reservado</small>
        </article>
        <article className="wallet-balance-card">
          <span>Recargas pendentes</span>
          <strong>{currency(pendingCredits)}</strong>
          <small>{pendingTopups.length} Pix aguardando confirmação</small>
        </article>
      </section>

      <section className="wallet-main-grid">
        <WalletTopup storeId={store.id} />

        <article className="wallet-rules-card">
          <div className="wallet-section-head">
            <div>
              <span className="eyebrow">Como funciona</span>
              <h2>Pagamento automático</h2>
            </div>
          </div>
          <div className="wallet-rule-list">
            <div><b>1</b><span><strong>Pedido pronto</strong><small>A taxa é reservada antes de buscar entregador.</small></span></div>
            <div><b>2</b><span><strong>Corrida em andamento</strong><small>O valor continua protegido no saldo reservado.</small></span></div>
            <div><b>3</b><span><strong>Entrega concluída</strong><small>A reserva vira débito uma única vez.</small></span></div>
            <div><b>4</b><span><strong>Cancelou ou expirou</strong><small>O valor reservado volta ao saldo disponível.</small></span></div>
          </div>
          <div className="wallet-rule-alert">
            Sem saldo disponível suficiente, o ChamaEntrega não publica uma nova corrida.
          </div>
        </article>
      </section>

      <section className="wallet-history-card">
        <div className="wallet-section-head">
          <div>
            <span className="eyebrow">Movimentações</span>
            <h2>Extrato da carteira</h2>
          </div>
          <span className="wallet-history-count">{recentTransactions.length} lançamentos</span>
        </div>

        {recentTransactions.length ? (
          <div className="wallet-transactions">
            {recentTransactions.map((tx: any) => {
              const credit = tx.direction === 'credit'
              return (
                <div className="wallet-transaction" key={tx.id}>
                  <span className={credit ? 'tx-icon credit' : 'tx-icon debit'}>
                    {credit ? '+' : '−'}
                  </span>
                  <span className="tx-copy">
                    <strong>{typeLabels[tx.transaction_type] ?? tx.description ?? 'Movimentação'}</strong>
                    <small>{tx.description ?? 'Carteira ChamaEntrega'} · {dateTime(tx.created_at)}</small>
                  </span>
                  <span className={credit ? 'tx-value credit' : 'tx-value debit'}>
                    {credit ? '+' : '−'} {currency(Number(tx.amount))}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="premium-empty">Nenhuma movimentação registrada ainda.</div>
        )}
      </section>
    </div>
  )
}
