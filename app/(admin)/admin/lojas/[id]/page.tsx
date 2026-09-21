import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'
import { AdminStoreDetailActions } from '@/components/admin-store-detail-actions'

const activeStatuses = [
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
]

const statusLabel:Record<string,string> = {
  draft:'Rascunho',
  available:'Buscando entregador',
  negotiating:'Negociando',
  accepted:'Aceita',
  heading_to_pickup:'A caminho da loja',
  at_pickup:'Na loja',
  heading_to_dropoff:'A caminho do cliente',
  at_dropoff:'No destino',
  completed:'Concluída',
  cancelled:'Cancelada',
  expired:'Expirada',
}

const roleLabel:Record<string,string> = {
  owner:'Proprietário',
  admin:'Administrador',
  manager:'Gerente',
  finance:'Financeiro',
  operator:'Operador',
}

const providerLabel:Record<string,string> = {
  whatsapp:'WhatsApp',
  ifood:'iFood',
  '99food':'99Food',
  goomer:'Goomer',
  own_menu:'Cardápio próprio',
  cardapio_proprio:'Cardápio próprio',
}

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  }).format(value)
}

function dateTime(value:string|null|undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    year:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
  }).format(new Date(value))
}

function shortId(value:string) {
  return '#' + value.replaceAll('-','').slice(0,7).toUpperCase()
}

export default async function AdminStoreDetailPage({
  params,
}:{
  params:Promise<{id:string}>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data:store,error:storeError } = await supabase
    .from('stores')
    .select('id,owner_id,organization_id,name,phone,logo_url,address,latitude,longitude,is_active,zip_code,street,street_number,complement,neighborhood,city,state,created_at,updated_at')
    .eq('id',id)
    .maybeSingle()

  if (storeError || !store) notFound()

  const [
    ownerResult,
    walletResult,
    deliveriesResult,
    membersResult,
    integrationsResult,
    pricingResult,
    transactionsResult,
    topupsResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,full_name,phone,role,avatar_url,created_at')
      .eq('id',store.owner_id)
      .maybeSingle(),
    supabase
      .from('store_wallets')
      .select('balance,reserved_balance,updated_at')
      .eq('store_id',store.id)
      .maybeSingle(),
    supabase
      .from('deliveries')
      .select('id,status,delivery_fee,delivery_distance_km,customer_name,delivery_address,assigned_courier_id,created_at,completed_at')
      .eq('store_id',store.id)
      .order('created_at',{ascending:false})
      .limit(120),
    supabase
      .from('store_members')
      .select('user_id,role,status,created_at')
      .eq('store_id',store.id)
      .order('created_at',{ascending:true}),
    supabase
      .from('store_integrations')
      .select('id,provider,status,is_enabled,last_synced_at,last_error,updated_at')
      .eq('store_id',store.id)
      .order('provider'),
    supabase
      .from('delivery_pricing_settings')
      .select('enabled,minimum_fee,included_km,per_extra_km,road_factor,round_step,updated_at')
      .eq('store_id',store.id)
      .maybeSingle(),
    supabase
      .from('store_wallet_transactions')
      .select('id,transaction_type,direction,amount,status,description,created_at')
      .eq('store_id',store.id)
      .order('created_at',{ascending:false})
      .limit(10),
    supabase
      .from('store_wallet_topups')
      .select('id,amount,status,provider,created_at,paid_at')
      .eq('store_id',store.id)
      .order('created_at',{ascending:false})
      .limit(8),
  ])

  const owner = ownerResult.data
  const wallet = walletResult.data
  const deliveries = deliveriesResult.data ?? []
  const members = membersResult.data ?? []
  const integrations = integrationsResult.data ?? []
  const pricing = pricingResult.data
  const transactions = transactionsResult.data ?? []
  const topups = topupsResult.data ?? []

  const memberIds = members.map(member => member.user_id)
  const { data:memberProfiles } = memberIds.length
    ? await supabase
      .from('profiles')
      .select('id,full_name,phone,role,avatar_url')
      .in('id',memberIds)
    : { data:[] }

  const profiles = new Map((memberProfiles ?? []).map(profile => [profile.id,profile]))

  const completed = deliveries.filter(delivery => delivery.status === 'completed').length
  const active = deliveries.filter(delivery => activeStatuses.includes(delivery.status)).length
  const searching = deliveries.filter(delivery => ['available','negotiating'].includes(delivery.status)).length
  const cancelled = deliveries.filter(delivery => ['cancelled','expired'].includes(delivery.status)).length
  const volume = deliveries
    .filter(delivery => !['draft','cancelled','expired'].includes(delivery.status))
    .reduce((sum,delivery) => sum + Number(delivery.delivery_fee ?? 0),0)
  const availableBalance = Number(wallet?.balance ?? 0) - Number(wallet?.reserved_balance ?? 0)
  const paidTopups = topups
    .filter(topup => topup.status === 'paid')
    .reduce((sum,topup) => sum + Number(topup.amount ?? 0),0)

  const expectedProviders = ['whatsapp','ifood','99food','goomer','own_menu']
  const integrationMap = new Map(integrations.map(integration => [integration.provider,integration]))

  return (
    <div className="admin-page admin-store-detail-page">
      <div className="admin-store-detail-breadcrumb">
        <Link href="/admin/lojas">
          <Icon name="arrow" size={14}/> Voltar para lojas
        </Link>
        <span>/</span>
        <strong>{store.name}</strong>
      </div>

      <section className="admin-store-detail-hero">
        <div className="admin-store-detail-identity">
          <span className="admin-store-detail-logo">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name}/>
              : store.name.slice(0,2).toUpperCase()}
          </span>
          <div>
            <div className="admin-eyebrow">OPERAÇÃO CADASTRADA</div>
            <h1>{store.name}</h1>
            <p>
              {store.city && store.state
                ? `${store.city} · ${store.state}`
                : store.address}
            </p>
            <div className="admin-store-detail-meta">
              <span className={store.is_active ? 'admin-status active' : 'admin-status paused'}>
                <i/>{store.is_active ? 'Loja ativa' : 'Loja pausada'}
              </span>
              <span>Cadastro: {dateTime(store.created_at)}</span>
              <span>ID {shortId(store.id)}</span>
            </div>
          </div>
        </div>

        <AdminStoreDetailActions
          storeId={store.id}
          isActive={Boolean(store.is_active)}
        />
      </section>

      <section className="admin-store-detail-metrics">
        <article>
          <span><Icon name="money" size={21}/></span>
          <div>
            <small>Saldo disponível</small>
            <strong>{money(availableBalance)}</strong>
            <em>{money(Number(wallet?.reserved_balance ?? 0))} reservado</em>
          </div>
        </article>
        <article>
          <span><Icon name="route" size={21}/></span>
          <div>
            <small>Entregas carregadas</small>
            <strong>{deliveries.length}</strong>
            <em>{active} em andamento · {searching} buscando</em>
          </div>
        </article>
        <article>
          <span><Icon name="check" size={21}/></span>
          <div>
            <small>Concluídas</small>
            <strong>{completed}</strong>
            <em>{cancelled} canceladas/expiradas</em>
          </div>
        </article>
        <article>
          <span><Icon name="chart" size={21}/></span>
          <div>
            <small>Volume em taxas</small>
            <strong>{money(volume)}</strong>
            <em>na amostra de entregas</em>
          </div>
        </article>
        <article>
          <span><Icon name="users" size={21}/></span>
          <div>
            <small>Equipe vinculada</small>
            <strong>{members.length}</strong>
            <em>usuários com acesso</em>
          </div>
        </article>
      </section>

      <section className="admin-store-detail-grid">
        <article className="admin-card admin-store-data-card">
          <header>
            <div>
              <span className="admin-card-kicker">CADASTRO</span>
              <h2>Dados da loja</h2>
            </div>
            <span className="admin-store-updated">Atualizado {dateTime(store.updated_at)}</span>
          </header>

          <div className="admin-store-info-grid">
            <div>
              <small>Nome da operação</small>
              <strong>{store.name}</strong>
            </div>
            <div>
              <small>Telefone</small>
              <strong>{store.phone || 'Não informado'}</strong>
            </div>
            <div className="wide">
              <small>Endereço de retirada</small>
              <strong>{store.address}</strong>
            </div>
            <div>
              <small>CEP</small>
              <strong>{store.zip_code || '—'}</strong>
            </div>
            <div>
              <small>Bairro</small>
              <strong>{store.neighborhood || '—'}</strong>
            </div>
            <div>
              <small>Cidade</small>
              <strong>{store.city || '—'}</strong>
            </div>
            <div>
              <small>Estado</small>
              <strong>{store.state || '—'}</strong>
            </div>
            <div className="wide">
              <small>Coordenadas</small>
              <strong>
                {store.latitude != null && store.longitude != null
                  ? `${Number(store.latitude).toFixed(6)}, ${Number(store.longitude).toFixed(6)}`
                  : 'Localização não cadastrada'}
              </strong>
            </div>
          </div>
        </article>

        <article className="admin-card admin-store-owner-card">
          <header>
            <div>
              <span className="admin-card-kicker">RESPONSÁVEL</span>
              <h2>Dono da operação</h2>
            </div>
          </header>

          <div className="admin-store-owner-profile">
            <span className="admin-store-owner-avatar">
              {owner?.avatar_url
                ? <img src={owner.avatar_url} alt=""/>
                : (owner?.full_name?.slice(0,1) ?? 'R')}
            </span>
            <div>
              <strong>{owner?.full_name || 'Responsável não identificado'}</strong>
              <small>{owner?.phone || 'Telefone não informado'}</small>
              <em>
                {owner?.role === 'admin'
                  ? 'Administrador ChamaEntrega'
                  : 'Responsável da loja'}
              </em>
            </div>
          </div>

          <div className="admin-store-owner-details">
            <div>
              <small>ID do usuário</small>
              <strong>{owner ? shortId(owner.id) : '—'}</strong>
            </div>
            <div>
              <small>Cadastro do responsável</small>
              <strong>{dateTime(owner?.created_at)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-store-detail-grid">
        <article className="admin-card admin-store-wallet-card">
          <header>
            <div>
              <span className="admin-card-kicker">CARTEIRA</span>
              <h2>Financeiro da loja</h2>
            </div>
            <Link href="/admin/financeiro">Financeiro geral →</Link>
          </header>

          <div className="admin-store-wallet-summary">
            <div>
              <small>Saldo total</small>
              <strong>{money(Number(wallet?.balance ?? 0))}</strong>
            </div>
            <div>
              <small>Disponível</small>
              <strong>{money(availableBalance)}</strong>
            </div>
            <div>
              <small>Reservado</small>
              <strong>{money(Number(wallet?.reserved_balance ?? 0))}</strong>
            </div>
            <div>
              <small>Recargas recentes pagas</small>
              <strong>{money(paidTopups)}</strong>
            </div>
          </div>

          <div className="admin-store-mini-list">
            <div className="title">Últimas movimentações</div>
            {transactions.map(tx => (
              <div key={tx.id}>
                <span className={tx.direction === 'credit' ? 'credit' : 'debit'}>
                  {tx.direction === 'credit' ? '+' : '−'}
                </span>
                <span>
                  <strong>{tx.description || tx.transaction_type}</strong>
                  <small>{dateTime(tx.created_at)}</small>
                </span>
                <em>{tx.status}</em>
                <b className={tx.direction === 'credit' ? 'credit' : 'debit'}>
                  {tx.direction === 'credit' ? '+' : '−'} {money(Number(tx.amount ?? 0))}
                </b>
              </div>
            ))}
            {!transactions.length ? <p>Nenhuma movimentação registrada.</p> : null}
          </div>
        </article>

        <article className="admin-card admin-store-pricing-card">
          <header>
            <div>
              <span className="admin-card-kicker">PRECIFICAÇÃO</span>
              <h2>Regras de entrega</h2>
            </div>
            <span className={pricing?.enabled === false ? 'admin-status paused' : 'admin-status active'}>
              <i/>{pricing?.enabled === false ? 'Desativada' : 'Ativa'}
            </span>
          </header>

          <div className="admin-pricing-grid">
            <div>
              <small>Taxa mínima</small>
              <strong>{money(Number(pricing?.minimum_fee ?? 7.5))}</strong>
            </div>
            <div>
              <small>KM incluídos</small>
              <strong>{Number(pricing?.included_km ?? 2).toFixed(1).replace('.',',')} km</strong>
            </div>
            <div>
              <small>KM adicional</small>
              <strong>{money(Number(pricing?.per_extra_km ?? 1.5))}</strong>
            </div>
            <div>
              <small>Fator viário</small>
              <strong>{Number(pricing?.road_factor ?? 1.25).toFixed(2).replace('.',',')}×</strong>
            </div>
            <div>
              <small>Arredondamento</small>
              <strong>{money(Number(pricing?.round_step ?? .5))}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-card admin-store-team-card">
        <header>
          <div>
            <span className="admin-card-kicker">EQUIPE E PERMISSÕES</span>
            <h2>Usuários da loja</h2>
          </div>
          <span className="admin-subtle-count">{members.length} vinculados</span>
        </header>

        <div className="admin-store-team-list">
          {members.map(member => {
            const profile = profiles.get(member.user_id)
            return (
              <div key={member.user_id}>
                <span className="admin-team-avatar">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt=""/>
                    : (profile?.full_name?.slice(0,1) ?? 'U')}
                </span>
                <span>
                  <strong>{profile?.full_name || 'Usuário'}</strong>
                  <small>{profile?.phone || 'Telefone não informado'}</small>
                </span>
                <em className="admin-role store_owner">
                  {roleLabel[member.role] ?? member.role}
                </em>
                <span className={member.status === 'active' ? 'admin-status active' : 'admin-status paused'}>
                  <i/>{member.status === 'active' ? 'Ativo' : member.status}
                </span>
                <small>{dateTime(member.created_at)}</small>
              </div>
            )
          })}
          {!members.length ? <div className="admin-empty">Nenhum usuário vinculado.</div> : null}
        </div>
      </section>

      <section className="admin-store-detail-grid integrations-grid">
        <article className="admin-card admin-store-integrations-card">
          <header>
            <div>
              <span className="admin-card-kicker">ECOSSISTEMA</span>
              <h2>Integrações</h2>
            </div>
          </header>

          <div className="admin-store-integration-list">
            {expectedProviders.map(provider => {
              const integration = integrationMap.get(provider)
              const connected = Boolean(
                integration &&
                integration.is_enabled &&
                ['connected','active','configured'].includes(integration.status)
              )

              return (
                <div key={provider}>
                  <span className={'provider '+provider}>
                    {provider === 'whatsapp'
                      ? 'WA'
                      : provider === 'ifood'
                        ? 'iF'
                        : provider === '99food'
                          ? '99'
                          : provider === 'goomer'
                            ? 'G'
                            : 'CE'}
                  </span>
                  <span>
                    <strong>{providerLabel[provider] ?? provider}</strong>
                    <small>
                      {integration?.last_error
                        ? integration.last_error
                        : integration?.last_synced_at
                          ? `Sincronizado ${dateTime(integration.last_synced_at)}`
                          : 'Sem sincronização registrada'}
                    </small>
                  </span>
                  <em className={connected ? 'connected' : integration ? 'waiting' : 'off'}>
                    {connected
                      ? 'Conectado'
                      : integration
                        ? integration.status
                        : 'Não configurado'}
                  </em>
                </div>
              )
            })}
          </div>
        </article>

        <article className="admin-card admin-store-operation-card">
          <header>
            <div>
              <span className="admin-card-kicker">OPERAÇÃO</span>
              <h2>Resumo operacional</h2>
            </div>
          </header>

          <div className="admin-store-operation-summary">
            <div>
              <span><Icon name="route" size={18}/></span>
              <small>Em andamento</small>
              <strong>{active}</strong>
            </div>
            <div>
              <span><Icon name="clock" size={18}/></span>
              <small>Buscando</small>
              <strong>{searching}</strong>
            </div>
            <div>
              <span><Icon name="check" size={18}/></span>
              <small>Concluídas</small>
              <strong>{completed}</strong>
            </div>
            <div>
              <span><Icon name="money" size={18}/></span>
              <small>Taxas</small>
              <strong>{money(volume)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-card admin-store-deliveries-card">
        <header>
          <div>
            <span className="admin-card-kicker">HISTÓRICO RECENTE</span>
            <h2>Últimas entregas</h2>
          </div>
          <Link href="/admin/corridas">Ver todas as corridas →</Link>
        </header>

        <div className="admin-store-delivery-list">
          <div className="head">
            <span>Corrida</span>
            <span>Cliente</span>
            <span>Endereço</span>
            <span>Status</span>
            <span>Distância</span>
            <span>Taxa</span>
            <span>Criada</span>
          </div>

          {deliveries.slice(0,12).map(delivery => (
            <div className="row" key={delivery.id}>
              <b>{shortId(delivery.id)}</b>
              <strong>{delivery.customer_name || 'Cliente'}</strong>
              <span>{delivery.delivery_address}</span>
              <em className={'admin-delivery-status '+delivery.status}>
                {statusLabel[delivery.status] ?? delivery.status}
              </em>
              <span>
                {delivery.delivery_distance_km == null
                  ? '—'
                  : Number(delivery.delivery_distance_km).toFixed(1).replace('.',',')+' km'}
              </span>
              <strong>{money(Number(delivery.delivery_fee ?? 0))}</strong>
              <small>{dateTime(delivery.created_at)}</small>
            </div>
          ))}

          {!deliveries.length ? <div className="admin-empty">Nenhuma entrega registrada.</div> : null}
        </div>
      </section>
    </div>
  )
}
