import { CreateDeliveryForm } from './create-form'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function NewDeliveryPage() {
  const { store } = await requireStore()
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_my_store_wallet', { p_store_id: store.id })
  const wallet = data?.[0]
  const availableBalance = Number(wallet?.available_balance ?? 0)
  const reservedBalance = Number(wallet?.reserved_balance ?? 0)

  return <>
    <div className="hero">
      <div>
        <div className="eyebrow">Nova corrida</div>
        <h1>Criar entrega</h1>
        <p className="subtle">Cadastre o pedido e só publique quando ele estiver realmente pronto.</p>
      </div>
    </div>
    <CreateDeliveryForm
      availableBalance={availableBalance}
      reservedBalance={reservedBalance}
    />
  </>
}
