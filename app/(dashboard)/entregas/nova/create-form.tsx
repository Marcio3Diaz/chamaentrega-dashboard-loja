'use client'
import { useActionState } from 'react'
import { createDeliveryAction, type CreateState } from './actions'
const initial: CreateState = {}

export function CreateDeliveryForm() {
  const [state, action, pending] = useActionState(createDeliveryAction, initial)
  return <form action={action} className="form">
    <section className="form-section"><h2>Cliente e destino</h2><div className="form-grid">
      <div className="field"><label>Nome do cliente</label><input name="customer_name" required placeholder="Ex.: João Silva" /></div>
      <div className="field"><label>Telefone</label><input name="customer_phone" placeholder="(21) 99999-9999" /></div>
      <div className="field full"><label>Endereço de entrega</label><input name="delivery_address" required placeholder="Rua, número, complemento, bairro" /></div>
      <div className="field"><label>Latitude (temporário)</label><input name="delivery_latitude" inputMode="decimal" placeholder="-22.90" /></div>
      <div className="field"><label>Longitude (temporário)</label><input name="delivery_longitude" inputMode="decimal" placeholder="-43.20" /></div>
      <div className="field full"><label>Observações</label><textarea name="customer_note" placeholder="Portaria, referência, instruções..." /></div>
    </div></section>
    <section className="form-section"><h2>Pedido e pagamento</h2><div className="form-grid">
      <div className="field"><label>Taxa do entregador (R$)</label><input name="delivery_fee" required inputMode="decimal" placeholder="12,50" /></div>
      <div className="field"><label>Total do pedido (R$)</label><input name="order_total" inputMode="decimal" placeholder="79,90" /></div>
      <div className="field"><label>Forma de pagamento</label><select name="payment_method" defaultValue="already_paid"><option value="already_paid">Já pago</option><option value="pix">Pix na entrega</option><option value="cash">Dinheiro</option><option value="card_on_delivery">Cartão na entrega</option></select></div>
      <div className="field"><label>Quantidade de itens</label><input name="item_count" type="number" min="1" defaultValue="1" /></div>
      <div className="field"><label>Peso aproximado (kg)</label><input name="package_weight_kg" inputMode="decimal" placeholder="1,2" /></div>
      <div className="field"><label>Tempo estimado (min)</label><input name="estimated_minutes" type="number" min="0" placeholder="20" /></div>
      <div className="field"><label>Distância até retirada (km)</label><input name="pickup_distance_km" inputMode="decimal" placeholder="1,0" /></div>
      <div className="field"><label>Retirada → cliente (km)</label><input name="delivery_distance_km" inputMode="decimal" placeholder="3,5" /></div>
    </div></section>
    <div className="notice">Nesta primeira versão, latitude/longitude e distâncias podem ser preenchidas manualmente. A próxima etapa é conectar autocomplete/geocodificação para calcular tudo automaticamente.</div>
    {state.error ? <div className="error">{state.error}</div> : null}
    <div className="form-actions"><button className="button button-dark" name="intent" value="draft" disabled={pending}>SALVAR RASCUNHO</button><button className="button button-gold" name="intent" value="publish" disabled={pending}>{pending ? 'PUBLICANDO...' : 'PEDIDO PRONTO — BUSCAR ENTREGADOR'}</button></div>
  </form>
}
