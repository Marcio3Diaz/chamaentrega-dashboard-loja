import { createClient } from '@/lib/supabase/server'

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  }).format(value)
}

function dateTime(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
  }).format(new Date(value))
}

const txLabel:Record<string,string> = {
  deposit:'Recarga',
  delivery_payment:'Pagamento de entrega',
  refund:'Reembolso',
  withdrawal:'Saque',
  adjustment:'Ajuste',
  bonus:'Bônus',
}

export default async function AdminFinancePage() {
  const supabase = await createClient()

  const [
    walletsResult,
    topupsResult,
    transactionsResult,
    storesResult,
    deliveriesResult,
  ] = await Promise.all([
    supabase
      .from('store_wallets')
      .select('store_id,balance,reserved_balance,updated_at'),
    supabase
      .from('store_wallet_topups')
      .select('id,store_id,amount,status,provider,created_at,paid_at')
      .order('created_at',{ascending:false}),
    supabase
      .from('store_wallet_transactions')
      .select('id,store_id,transaction_type,direction,amount,status,description,created_at')
      .order('created_at',{ascending:false}),
    supabase
      .from('stores')
      .select('id,name,is_active'),
    supabase
      .from('deliveries')
      .select('store_id,status,delivery_fee,created_at'),
  ])

  const wallets = walletsResult.data ?? []
  const topups = topupsResult.data ?? []
  const transactions = transactionsResult.data ?? []
  const stores = new Map((storesResult.data ?? []).map(store => [store.id,store]))
  const deliveries = deliveriesResult.data ?? []

  const totalBalance = wallets.reduce((sum,wallet) => sum+Number(wallet.balance ?? 0),0)
  const totalReserved = wallets.reduce((sum,wallet) => sum+Number(wallet.reserved_balance ?? 0),0)
  const paidTopups = topups.filter(topup => topup.status === 'paid')
  const paidTopupVolume = paidTopups.reduce((sum,topup) => sum+Number(topup.amount ?? 0),0)
  const pendingTopups = topups.filter(topup => topup.status === 'pending')
  const pendingTopupVolume = pendingTopups.reduce((sum,topup) => sum+Number(topup.amount ?? 0),0)
  const deliveryDebits = transactions.filter(tx =>
    tx.direction === 'debit' &&
    tx.transaction_type === 'delivery_payment' &&
    tx.status === 'completed'
  )
  const deliveryDebitVolume = deliveryDebits.reduce((sum,tx) => sum+Number(tx.amount ?? 0),0)
  const deliveryFeeVolume = deliveries
    .filter(delivery => !['draft','cancelled','expired'].includes(delivery.status))
    .reduce((sum,delivery) => sum+Number(delivery.delivery_fee ?? 0),0)

  const walletByStore = new Map(wallets.map(wallet => [wallet.store_id,wallet]))
  const storeRows = Array.from(stores.values()).map(store => {
    const wallet = walletByStore.get(store.id)
    const paid = paidTopups
      .filter(topup => topup.store_id === store.id)
      .reduce((sum,topup) => sum+Number(topup.amount ?? 0),0)
    const fees = deliveries
      .filter(delivery => delivery.store_id === store.id && !['draft','cancelled','expired'].includes(delivery.status))
      .reduce((sum,delivery) => sum+Number(delivery.delivery_fee ?? 0),0)

    return {
      id:store.id,
      name:store.name,
      active:Boolean(store.is_active),
      balance:Number(wallet?.balance ?? 0),
      reserved:Number(wallet?.reserved_balance ?? 0),
      paid,
      fees,
    }
  }).sort((a,b) => b.paid-a.paid)

  return (
    <div className="admin-page">
      <section className="admin-page-head">
        <div>
          <div className="admin-eyebrow">FINANCEIRO DA PLATAFORMA</div>
          <h1>Financeiro</h1>
          <p>Consolidação de carteiras, recargas e débitos de entrega das lojas cadastradas.</p>
        </div>
      </section>

      <section className="admin-compact-metrics">
        <article>
          <small>Saldo em carteiras</small>
          <strong>{money(totalBalance)}</strong>
          <span>saldo acumulado das lojas</span>
        </article>
        <article>
          <small>Saldo reservado</small>
          <strong>{money(totalReserved)}</strong>
          <span>protegido em corridas</span>
        </article>
        <article>
          <small>Recargas pagas</small>
          <strong>{money(paidTopupVolume)}</strong>
          <span>{paidTopups.length} confirmações</span>
        </article>
        <article>
          <small>Pix pendente</small>
          <strong>{money(pendingTopupVolume)}</strong>
          <span>{pendingTopups.length} aguardando</span>
        </article>
        <article>
          <small>Taxas movimentadas</small>
          <strong>{money(deliveryFeeVolume)}</strong>
          <span>{money(deliveryDebitVolume)} debitado nas carteiras</span>
        </article>
      </section>

      <section className="admin-overview-grid">
        <article className="admin-card admin-list-card">
          <header>
            <div>
              <span className="admin-card-kicker">POR LOJA</span>
              <h2>Carteiras da rede</h2>
            </div>
          </header>

          <div className="admin-finance-store-list">
            {storeRows.map(store => (
              <div key={store.id}>
                <span>
                  <strong>{store.name}</strong>
                  <small>{store.active ? 'Loja ativa' : 'Loja pausada'}</small>
                </span>
                <span>
                  <small>Saldo</small>
                  <strong>{money(store.balance)}</strong>
                </span>
                <span>
                  <small>Reservado</small>
                  <strong>{money(store.reserved)}</strong>
                </span>
                <span>
                  <small>Recargas</small>
                  <strong>{money(store.paid)}</strong>
                </span>
                <span>
                  <small>Taxas</small>
                  <strong>{money(store.fees)}</strong>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-card admin-list-card">
          <header>
            <div>
              <span className="admin-card-kicker">PIX</span>
              <h2>Recargas recentes</h2>
            </div>
          </header>

          <div className="admin-topup-list">
            {topups.slice(0,12).map(topup => (
              <div key={topup.id}>
                <span>
                  <strong>{stores.get(topup.store_id)?.name ?? 'Loja'}</strong>
                  <small>{dateTime(topup.created_at)}</small>
                </span>
                <strong>{money(Number(topup.amount ?? 0))}</strong>
                <em className={'admin-topup-status '+topup.status}>
                  {topup.status === 'paid'
                    ? 'Pago'
                    : topup.status === 'pending'
                      ? 'Pendente'
                      : topup.status}
                </em>
              </div>
            ))}
            {!topups.length ? <div className="admin-empty">Nenhuma recarga registrada.</div> : null}
          </div>
        </article>
      </section>

      <section className="admin-card admin-list-card">
        <header>
          <div>
            <span className="admin-card-kicker">EXTRATO GLOBAL</span>
            <h2>Movimentações recentes</h2>
          </div>
        </header>

        <div className="admin-transaction-list">
          {transactions.slice(0,50).map(tx => (
            <div key={tx.id}>
              <span className={tx.direction === 'credit' ? 'credit' : 'debit'}>
                {tx.direction === 'credit' ? '+' : '−'}
              </span>
              <span>
                <strong>{txLabel[tx.transaction_type] ?? tx.description ?? 'Movimentação'}</strong>
                <small>{stores.get(tx.store_id)?.name ?? 'Loja'} · {dateTime(tx.created_at)}</small>
              </span>
              <em>{tx.status}</em>
              <strong className={tx.direction === 'credit' ? 'credit' : 'debit'}>
                {tx.direction === 'credit' ? '+' : '−'} {money(Number(tx.amount ?? 0))}
              </strong>
            </div>
          ))}
          {!transactions.length ? <div className="admin-empty">Nenhuma movimentação registrada.</div> : null}
        </div>
      </section>
    </div>
  )
}
