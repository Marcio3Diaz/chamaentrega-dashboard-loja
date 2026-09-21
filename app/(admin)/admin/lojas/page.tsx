import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'
import {
  AdminStoresPanel,
  type AdminStoreRow,
} from '@/components/admin-stores-panel'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

export default async function AdminStoresPage() {
  const supabase = await createClient()

  const [
    storesResult,
    profilesResult,
    walletsResult,
    deliveriesResult,
  ] = await Promise.all([
    supabase
      .from('stores')
      .select('id,owner_id,name,phone,logo_url,address,is_active,city,state,created_at')
      .order('created_at',{ascending:false}),
    supabase
      .from('profiles')
      .select('id,full_name')
      .in('role',['store_owner','admin']),
    supabase
      .from('store_wallets')
      .select('store_id,balance,reserved_balance'),
    supabase
      .from('deliveries')
      .select('id,store_id,status,delivery_fee'),
  ])

  const profiles = new Map((profilesResult.data ?? []).map(profile => [profile.id,profile]))
  const wallets = new Map((walletsResult.data ?? []).map(wallet => [wallet.store_id,wallet]))
  const deliveryStats = new Map<string,{
    total:number
    completed:number
    active:number
    volume:number
  }>()

  for (const delivery of deliveriesResult.data ?? []) {
    const current = deliveryStats.get(delivery.store_id) ?? {
      total:0,
      completed:0,
      active:0,
      volume:0,
    }

    current.total += 1
    if (delivery.status === 'completed') current.completed += 1
    if (activeStatuses.includes(delivery.status)) current.active += 1
    if (!['draft','cancelled','expired'].includes(delivery.status)) {
      current.volume += Number(delivery.delivery_fee ?? 0)
    }
    deliveryStats.set(delivery.store_id,current)
  }

  const stores:AdminStoreRow[] = (storesResult.data ?? []).map(store => {
    const profile = profiles.get(store.owner_id)
    const wallet = wallets.get(store.id)
    const stats = deliveryStats.get(store.id) ?? {
      total:0,
      completed:0,
      active:0,
      volume:0,
    }

    return {
      id:store.id,
      name:store.name,
      logoUrl:store.logo_url,
      phone:store.phone,
      city:store.city,
      state:store.state,
      address:store.address,
      isActive:Boolean(store.is_active),
      createdAt:store.created_at,
      ownerName:profile?.full_name?.trim() || 'Responsável não identificado',
      walletBalance:Number(wallet?.balance ?? 0),
      walletReserved:Number(wallet?.reserved_balance ?? 0),
      totalDeliveries:stats.total,
      completedDeliveries:stats.completed,
      activeDeliveries:stats.active,
      deliveryVolume:stats.volume,
    }
  })

  const active = stores.filter(store => store.isActive).length
  const totalBalance = stores.reduce((sum,store) => sum+store.walletBalance,0)
  const totalDeliveries = stores.reduce((sum,store) => sum+store.totalDeliveries,0)

  const money = new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  })

  return (
    <div className="admin-page admin-stores-v2-page">
      <section className="admin-page-head admin-page-head-v2">
        <div>
          <div className="admin-eyebrow">EMPRESAS DA PLATAFORMA</div>
          <h1>Gestão de lojas</h1>
          <p>
            Acompanhe cadastros, operação, carteira e desempenho de cada empresa
            conectada ao ChamaEntrega.
          </p>
        </div>

        <div className="admin-page-head-actions">
          <Link href="/admin/corridas" className="admin-page-secondary-action">
            <Icon name="route" size={17}/> Ver corridas
          </Link>
          <Link href="/admin/entregadores" className="admin-page-primary-action">
            <Icon name="users" size={17}/> Rede de entregadores
          </Link>
        </div>
      </section>

      <section className="admin-compact-metrics admin-store-metrics-v2">
        <article>
          <span className="metric-icon gold"><Icon name="store" size={21}/></span>
          <div>
            <small>Total de lojas</small>
            <strong>{stores.length}</strong>
            <span>operações cadastradas</span>
          </div>
        </article>
        <article>
          <span className="metric-icon green"><Icon name="check" size={21}/></span>
          <div>
            <small>Lojas ativas</small>
            <strong>{active}</strong>
            <span>{stores.length-active} pausadas</span>
          </div>
        </article>
        <article>
          <span className="metric-icon blue"><Icon name="route" size={21}/></span>
          <div>
            <small>Corridas acumuladas</small>
            <strong>{totalDeliveries}</strong>
            <span>em todas as lojas</span>
          </div>
        </article>
        <article>
          <span className="metric-icon gold"><Icon name="money" size={21}/></span>
          <div>
            <small>Saldo em carteiras</small>
            <strong>{money.format(totalBalance)}</strong>
            <span>saldo total da rede</span>
          </div>
        </article>
      </section>

      <section className="admin-card admin-list-card admin-list-card-v2">
        <header>
          <div>
            <span className="admin-card-kicker">GESTÃO DE LOJAS</span>
            <h2>Operações cadastradas</h2>
          </div>
        </header>
        <AdminStoresPanel initialStores={stores}/>
      </section>
    </div>
  )
}
