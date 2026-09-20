'use client'
import { useActionState, useMemo, useState } from 'react'
import { createDeliveryAction, type CreateState } from './actions'

const initial: CreateState = {}

export type DeliveryOrderPrefill = {
  orderId: string
  externalOrderId: string | null
  customerName: string
  customerPhone: string
  deliveryAddress: string
  deliveryLatitude: string
  deliveryLongitude: string
  orderTotal: string
  paymentMethod: string
  customerNote: string
  itemCount: number
}

export function CreateDeliveryForm({
  availableBalance,
  reservedBalance,
  initialOrder,
}: {
  availableBalance: number
  reservedBalance: number
  initialOrder?: DeliveryOrderPrefill | null
}) {
  const [state, action, pending] = useActionState(createDeliveryAction, initial)
  const [fee, setFee] = useState('')
  const feeValue = useMemo(() => {
    const value = Number(fee.replace(',', '.'))
    return Number.isFinite(value) ? value : 0
  }, [fee])
  const insufficient = feeValue > availableBalance

  return <form action={action} className="form">
    {initialOrder ? <>
      <input type="hidden" name="store_order_id" value={initialOrder.orderId}/>
      <div className="notice">
        Este formulário está vinculado ao pedido integrado <strong>#{initialOrder.externalOrderId || initialOrder.orderId.replaceAll('-','').slice(0,7).toUpperCase()}</strong>.
        Ao publicar, a corrida ficará ligada ao pedido automaticamente.
      </div>
    </> : null}

    <section className="wallet-create-summary">
      <div>
        <span>Saldo disponível</span>
        <strong>R$ {availableBalance.toFixed(2).replace('.', ',')}</strong>
      </div>
      <div>
        <span>Saldo reservado</span>
        <strong>R$ {reservedBalance.toFixed(2).replace('.', ',')}</strong>
      </div>
      <p>
        Ao publicar, a taxa do entregador fica reservada na carteira até a conclusão ou cancelamento.
      </p>
    </section>

    <section className="form-section"><h2>Cliente e destino</h2><div className="form-grid">
      <div className="field"><label>Nome do cliente</label><input name="customer_name" required placeholder="Ex.: João Silva" defaultValue={initialOrder?.customerName ?? ''} /></div>
      <div className="field"><label>Telefone</label><input name="customer_phone" placeholder="(21) 99999-9999" defaultValue={initialOrder?.customerPhone ?? ''} /></div>
      <div className="field full"><label>Endereço de entrega</label><input name="delivery_address" required placeholder="Rua, número, complemento, bairro" defaultValue={initialOrder?.deliveryAddress ?? ''} /></div>
      <div className="field"><label>Latitude (temporário)</label><input name="delivery_latitude" inputMode="decimal" placeholder="-22.90" defaultValue={initialOrder?.deliveryLatitude ?? ''} /></div>
      <div className="field"><label>Longitude (temporário)</label><input name="delivery_longitude" inputMode="decimal" placeholder="-43.20" defaultValue={initialOrder?.deliveryLongitude ?? ''} /></div>
      <div className="field full"><label>Observações</label><textarea name="customer_note" placeholder="Portaria, referência, instruções..." defaultValue={initialOrder?.customerNote ?? ''} /></div>
    </div></section>

    <section className="form-section"><h2>Pedido e pagamento</h2><div className="form-grid">
      <div className="field"><label>Taxa do entregador (R$)</label><input name="delivery_fee" required inputMode="decimal" placeholder="12,50" value={fee} onChange={e => setFee(e.target.value)} /></div>
      <div className="field"><label>Total do pedido (R$)</label><input name="order_total" inputMode="decimal" placeholder="79,90" defaultValue={initialOrder?.orderTotal ?? ''} /></div>
      <div className="field"><label>Forma de pagamento</label><select name="payment_method" defaultValue={initialOrder?.paymentMethod ?? 'already_paid'}><option value="already_paid">Já pago</option><option value="pix">Pix na entrega</option><option value="cash">Dinheiro</option><option value="card_on_delivery">Cartão na entrega</option></select></div>
      <div className="field"><label>Quantidade de itens</label><input name="item_count" type="number" min="1" defaultValue={initialOrder?.itemCount ?? 1} /></div>
      <div className="field"><label>Peso aproximado (kg)</label><input name="package_weight_kg" inputMode="decimal" placeholder="1,2" /></div>
      <div className="field"><label>Tempo estimado (min)</label><input name="estimated_minutes" type="number" min="0" placeholder="20" /></div>
      <div className="field"><label>Distância até retirada (km)</label><input name="pickup_distance_km" inputMode="decimal" placeholder="1,0" /></div>
      <div className="field"><label>Retirada → cliente (km)</label><input name="delivery_distance_km" inputMode="decimal" placeholder="3,5" /></div>
    </div></section>

    <div className="notice">Revise endereço, pagamento e taxa antes de publicar. A busca por entregador só começa quando você confirmar que o pedido está pronto.</div>
    {insufficient ? <div className="error">Saldo insuficiente para publicar esta entrega. Adicione saldo no Financeiro.</div> : null}
    {state.error ? <div className="error">{state.error}</div> : null}
    <div className="form-actions">
      <button className="button button-dark" name="intent" value="draft" disabled={pending}>SALVAR RASCUNHO</button>
      <button className="button button-gold" name="intent" value="publish" disabled={pending || insufficient || feeValue <= 0}>
        {pending ? 'PUBLICANDO...' : 'PEDIDO PRONTO — BUSCAR ENTREGADOR'}
      </button>
    </div>
  </form>
}
