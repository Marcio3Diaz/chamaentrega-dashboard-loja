import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'
import {
  registerSubscriptionPaymentAction,
  updatePlatformBillingSettingsAction,
  updateStoreSubscriptionAction,
} from './actions'

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

function dateInput(value:string|null|undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0,10)
}

function saoPauloDateKey(value:string|Date) {
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(new Date(value))

  const year = parts.find(part => part.type === 'year')?.value ?? ''
  const month = parts.find(part => part.type === 'month')?.value ?? ''
  const day = parts.find(part => part.type === 'day')?.value ?? ''

  return `${year}-${month}-${day}`
}

function subscriptionIsDue(value:string|null|undefined) {
  if (!value) return true
  return saoPauloDateKey(value) <= saoPauloDateKey(new Date())
}

const statusLabel:Record<string,string> = {
  inactive:'Sem plano',
  trialing:'Em teste',
  active:'Ativa',
  paused:'Pausada',
  cancelled:'Cancelada',
}

const revenueLabel:Record<string,string> = {
  delivery_commission:'Comissão por entrega',
  subscription:'Assinatura',
  adjustment:'Ajuste',
}

export default async function AdminFinancePage() {
  const supabase = await createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(),now.getMonth(),1).toISOString()

  const [
    settingsResult,
    subscriptionsResult,
    eventsResult,
    storesResult,
    deliveriesResult,
  ] = await Promise.all([
    supabase
      .from('platform_billing_settings')
      .select('commission_enabled,delivery_commission_percent,subscriptions_enabled,default_subscription_amount,updated_at')
      .eq('id',1)
      .maybeSingle(),
    supabase
      .from('store_subscriptions')
      .select('id,store_id,plan_name,monthly_amount,status,started_at,next_billing_at,last_billed_at,updated_at')
      .order('updated_at',{ascending:false}),
    supabase
      .from('platform_revenue_events')
      .select('id,store_id,delivery_id,subscription_id,revenue_type,gross_reference_amount,rate_percent,amount,status,description,occurred_at')
      .order('occurred_at',{ascending:false})
      .limit(200),
    supabase
      .from('stores')
      .select('id,name,logo_url,is_active,city,state,created_at')
      .order('name'),
    supabase
      .from('deliveries')
      .select('id,store_id,status,delivery_fee,completed_at,created_at')
      .eq('status','completed'),
  ])

  const settings = settingsResult.data ?? {
    commission_enabled:false,
    delivery_commission_percent:0,
    subscriptions_enabled:false,
    default_subscription_amount:0,
    updated_at:null,
  }
  const subscriptions = subscriptionsResult.data ?? []
  const events = eventsResult.data ?? []
  const stores = storesResult.data ?? []
  const deliveries = deliveriesResult.data ?? []

  const storeMap = new Map(stores.map(store => [store.id,store]))
  const subscriptionMap = new Map(subscriptions.map(subscription => [subscription.store_id,subscription]))

  const validEvents = events.filter(event => event.status !== 'void')
  const paidEvents = validEvents.filter(event => event.status === 'paid')
  const accruedEvents = validEvents.filter(event => event.status === 'accrued')
  const bookedRevenue = validEvents.reduce((sum,event) => sum+Number(event.amount ?? 0),0)
  const paidRevenue = paidEvents.reduce((sum,event) => sum+Number(event.amount ?? 0),0)
  const receivableRevenue = accruedEvents.reduce((sum,event) => sum+Number(event.amount ?? 0),0)
  const monthRevenue = validEvents
    .filter(event => new Date(event.occurred_at).getTime() >= new Date(monthStart).getTime())
    .reduce((sum,event) => sum+Number(event.amount ?? 0),0)
  const deliveryRevenue = validEvents
    .filter(event => event.revenue_type === 'delivery_commission')
    .reduce((sum,event) => sum+Number(event.amount ?? 0),0)
  const subscriptionRevenue = validEvents
    .filter(event => event.revenue_type === 'subscription')
    .reduce((sum,event) => sum+Number(event.amount ?? 0),0)

  const activeSubscriptions = subscriptions.filter(subscription => subscription.status === 'active')
  const mrr = activeSubscriptions.reduce((sum,subscription) => sum+Number(subscription.monthly_amount ?? 0),0)
  const completedFeeVolume = deliveries.reduce((sum,delivery) => sum+Number(delivery.delivery_fee ?? 0),0)
  const currentRate = Number(settings.delivery_commission_percent ?? 0)
  const projectedCommission = settings.commission_enabled
    ? completedFeeVolume*currentRate/100
    : 0

  const storeRows = stores.map(store => {
    const subscription = subscriptionMap.get(store.id)
    const storeDeliveries = deliveries.filter(delivery => delivery.store_id === store.id)
    const deliveryBase = storeDeliveries.reduce((sum,delivery) => sum+Number(delivery.delivery_fee ?? 0),0)
    const storeEvents = validEvents.filter(event => event.store_id === store.id)
    const commission = storeEvents
      .filter(event => event.revenue_type === 'delivery_commission')
      .reduce((sum,event) => sum+Number(event.amount ?? 0),0)
    const subscriptionRevenue = storeEvents
      .filter(event => event.revenue_type === 'subscription')
      .reduce((sum,event) => sum+Number(event.amount ?? 0),0)

    return {
      store,
      subscription,
      completedDeliveries:storeDeliveries.length,
      deliveryBase,
      commission,
      subscriptionRevenue,
      totalRevenue:commission+subscriptionRevenue,
    }
  }).sort((a,b) => b.totalRevenue-a.totalRevenue)

  return (
    <div className="admin-page admin-platform-finance-page">
      <section className="admin-page-head admin-page-head-v2">
        <div>
          <div className="admin-eyebrow">RECEITA DO CHAMAENTREGA</div>
          <h1>Financeiro da plataforma</h1>
          <p>
            Aqui entram somente as receitas do ChamaEntrega: assinaturas das lojas
            e comissão percentual sobre entregas. As carteiras dos restaurantes
            continuam separadas no Portal da Loja.
          </p>
        </div>

        <div className="admin-platform-finance-badge">
          <Icon name="shield" size={22}/>
          <span>
            <small>CONTABILIDADE DA PLATAFORMA</small>
            <strong>Separada das carteiras das lojas</strong>
          </span>
        </div>
      </section>

      <section className="admin-platform-finance-metrics">
        <article className="primary">
          <span><Icon name="money" size={22}/></span>
          <div>
            <small>Receita contabilizada</small>
            <strong>{money(bookedRevenue)}</strong>
            <em>{money(paidRevenue)} recebido</em>
          </div>
        </article>
        <article>
          <span><Icon name="clock" size={22}/></span>
          <div>
            <small>A receber</small>
            <strong>{money(receivableRevenue)}</strong>
            <em>comissões ainda não liquidadas</em>
          </div>
        </article>
        <article>
          <span><Icon name="chart" size={22}/></span>
          <div>
            <small>Receita deste mês</small>
            <strong>{money(monthRevenue)}</strong>
            <em>assinaturas + comissões</em>
          </div>
        </article>
        <article>
          <span><Icon name="store" size={22}/></span>
          <div>
            <small>MRR de assinaturas</small>
            <strong>{money(mrr)}</strong>
            <em>{activeSubscriptions.length} assinatura{activeSubscriptions.length===1?'':'s'} ativa{activeSubscriptions.length===1?'':'s'}</em>
          </div>
        </article>
        <article>
          <span><Icon name="route" size={22}/></span>
          <div>
            <small>Receita por entregas</small>
            <strong>{money(deliveryRevenue)}</strong>
            <em>{deliveries.length} entregas concluídas</em>
          </div>
        </article>
      </section>

      <section className="admin-platform-finance-grid">
        <article className="admin-v2-panel billing-model-card">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">MODELO DE MONETIZAÇÃO</span>
              <h2>Como o ChamaEntrega ganha dinheiro</h2>
              <p>Configure as duas fontes de receita da plataforma.</p>
            </div>
            <span className="billing-settings-updated">
              Atualizado {dateTime(settings.updated_at)}
            </span>
          </header>

          <form action={updatePlatformBillingSettingsAction} className="billing-settings-form">
            <label className="billing-model-option">
              <span className="billing-model-icon commission">
                <Icon name="route" size={21}/>
              </span>
              <span>
                <strong>Comissão sobre entregas</strong>
                <small>
                  Percentual da plataforma calculado quando uma entrega é concluída.
                </small>
              </span>
              <input
                type="checkbox"
                name="commission_enabled"
                defaultChecked={Boolean(settings.commission_enabled)}
              />
            </label>

            <div className="billing-form-field">
              <label htmlFor="delivery_commission_percent">Percentual da plataforma</label>
              <div className="billing-input-suffix">
                <input
                  id="delivery_commission_percent"
                  name="delivery_commission_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={currentRate}
                />
                <span>%</span>
              </div>
              <small>
                Ex.: 5% sobre uma entrega de R$ 20,00 gera R$ 1,00 de receita para a plataforma.
              </small>
            </div>

            <label className="billing-model-option">
              <span className="billing-model-icon subscription">
                <Icon name="store" size={21}/>
              </span>
              <span>
                <strong>Assinatura mensal</strong>
                <small>
                  Mensalidade cobrada das lojas que usam a plataforma.
                </small>
              </span>
              <input
                type="checkbox"
                name="subscriptions_enabled"
                defaultChecked={Boolean(settings.subscriptions_enabled)}
              />
            </label>

            <div className="billing-form-field">
              <label htmlFor="default_subscription_amount">Valor padrão da assinatura</label>
              <div className="billing-input-prefix">
                <span>R$</span>
                <input
                  id="default_subscription_amount"
                  name="default_subscription_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(settings.default_subscription_amount ?? 0)}
                />
              </div>
              <small>
                Cada loja pode ter um plano e valor diferente na seção de assinaturas.
              </small>
            </div>

            <button className="billing-save-button" type="submit">
              <Icon name="check" size={16}/>
              Salvar modelo de cobrança
            </button>
          </form>
        </article>

        <article className="admin-v2-panel billing-summary-card">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">VISÃO DE RECEITA</span>
              <h2>Composição atual</h2>
              <p>De onde vem a receita registrada.</p>
            </div>
          </header>

          <div className="billing-revenue-split">
            <div>
              <span className="commission"><Icon name="route" size={19}/></span>
              <small>Comissões</small>
              <strong>{money(deliveryRevenue)}</strong>
              <em>
                {bookedRevenue > 0
                  ? Math.round((deliveryRevenue/bookedRevenue)*100)
                  : 0}% da receita
              </em>
            </div>
            <div>
              <span className="subscription"><Icon name="store" size={19}/></span>
              <small>Assinaturas</small>
              <strong>{money(subscriptionRevenue)}</strong>
              <em>
                {bookedRevenue > 0
                  ? Math.round((subscriptionRevenue/bookedRevenue)*100)
                  : 0}% da receita
              </em>
            </div>
          </div>

          <div className="billing-projection">
            <div>
              <small>Base acumulada de entregas concluídas</small>
              <strong>{money(completedFeeVolume)}</strong>
            </div>
            <div>
              <small>Projeção no percentual atual ({currentRate.toFixed(2).replace('.',',')}%)</small>
              <strong>{money(projectedCommission)}</strong>
            </div>
          </div>

          <div className="billing-info-note">
            <Icon name="shield" size={17}/>
            <p>
              Alterar o percentual não modifica receitas antigas. Novas comissões
              são registradas quando as próximas entregas forem concluídas.
            </p>
          </div>
        </article>
      </section>

      <section className="admin-v2-panel platform-store-revenue-card">
        <header className="admin-v2-panel-head">
          <div>
            <span className="admin-card-kicker">RECEITA POR CLIENTE</span>
            <h2>Lojas e monetização</h2>
            <p>Quanto cada operação gera para a plataforma.</p>
          </div>
        </header>

        <div className="platform-revenue-table">
          <div className="head">
            <span>Loja</span>
            <span>Plano</span>
            <span>Mensalidade</span>
            <span>Entregas</span>
            <span>Base entregas</span>
            <span>Comissões</span>
            <span>Receita total</span>
          </div>

          {storeRows.map(row => (
            <div className="row" key={row.store.id}>
              <span className="platform-store-cell">
                <span className="platform-store-avatar">
                  {row.store.logo_url
                    ? <img src={row.store.logo_url} alt=""/>
                    : row.store.name.slice(0,2).toUpperCase()}
                </span>
                <span>
                  <strong>{row.store.name}</strong>
                  <small>
                    {row.store.city && row.store.state
                      ? `${row.store.city} · ${row.store.state}`
                      : row.store.is_active ? 'Loja ativa' : 'Loja pausada'}
                  </small>
                </span>
              </span>
              <span>
                <strong>{row.subscription?.plan_name ?? 'Sem plano'}</strong>
                <small>{statusLabel[row.subscription?.status ?? 'inactive']}</small>
              </span>
              <strong>{money(Number(row.subscription?.monthly_amount ?? 0))}</strong>
              <strong>{row.completedDeliveries}</strong>
              <strong>{money(row.deliveryBase)}</strong>
              <strong>{money(row.commission)}</strong>
              <strong className="platform-revenue-total">{money(row.totalRevenue)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-platform-finance-grid subscriptions-grid">
        <article className="admin-v2-panel admin-subscriptions-card">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">ASSINATURAS</span>
              <h2>Planos das lojas</h2>
              <p>Defina plano, mensalidade, status e próxima cobrança.</p>
            </div>
          </header>

          <div className="admin-subscription-list">
            {stores.map(store => {
              const subscription = subscriptionMap.get(store.id)

              return (
                <form action={updateStoreSubscriptionAction} key={store.id}>
                  <input type="hidden" name="store_id" value={store.id}/>
                  <span className="subscription-store-name">
                    <strong>{store.name}</strong>
                    <small>{store.is_active ? 'Operação ativa' : 'Operação pausada'}</small>
                  </span>

                  <label>
                    <small>Plano</small>
                    <input
                      name="plan_name"
                      defaultValue={subscription?.plan_name ?? 'Plano ChamaEntrega'}
                    />
                  </label>

                  <label>
                    <small>Mensalidade</small>
                    <input
                      name="monthly_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={Number(
                        subscription?.monthly_amount ??
                        settings.default_subscription_amount ??
                        0
                      )}
                    />
                  </label>

                  <label>
                    <small>Status</small>
                    <select name="status" defaultValue={subscription?.status ?? 'inactive'}>
                      <option value="inactive">Sem plano</option>
                      <option value="trialing">Em teste</option>
                      <option value="active">Ativa</option>
                      <option value="paused">Pausada</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </label>

                  <label>
                    <small>Próxima cobrança</small>
                    <input
                      name="next_billing_at"
                      type="date"
                      defaultValue={dateInput(subscription?.next_billing_at)}
                    />
                  </label>

                  <button type="submit">Salvar</button>
                </form>
              )
            })}
          </div>
        </article>

        <article className="admin-v2-panel subscription-payments-card">
          <header className="admin-v2-panel-head">
            <div>
              <span className="admin-card-kicker">COBRANÇA</span>
              <h2>Receber assinatura</h2>
              <p>Registro manual enquanto o gateway de cobrança não estiver automatizado.</p>
            </div>
          </header>

          <div className="subscription-payment-list">
            {subscriptions
              .filter(subscription =>
                ['active','trialing'].includes(subscription.status) &&
                Number(subscription.monthly_amount ?? 0) > 0
              )
              .map(subscription => {
                const isDue = subscriptionIsDue(subscription.next_billing_at)

                return (
                  <div key={subscription.id}>
                    <span>
                      <strong>{storeMap.get(subscription.store_id)?.name ?? 'Loja'}</strong>
                      <small>
                        Próxima: {dateTime(subscription.next_billing_at)}
                      </small>
                    </span>
                    <strong>{money(Number(subscription.monthly_amount ?? 0))}</strong>
                    <form action={registerSubscriptionPaymentAction}>
                      <input type="hidden" name="subscription_id" value={subscription.id}/>
                      <button type="submit" disabled={!isDue}>
                        {isDue ? 'Registrar pagamento' : 'Aguardando vencimento'}
                      </button>
                    </form>
                  </div>
                )
              })}

            {!subscriptions.some(subscription =>
              ['active','trialing'].includes(subscription.status) &&
              Number(subscription.monthly_amount ?? 0) > 0
            ) ? (
              <div className="admin-empty">
                Nenhuma assinatura ativa com valor mensal.
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="admin-v2-panel platform-revenue-events-card">
        <header className="admin-v2-panel-head">
          <div>
            <span className="admin-card-kicker">EXTRATO DA PLATAFORMA</span>
            <h2>Receitas recentes</h2>
            <p>Somente receitas pertencentes ao ChamaEntrega.</p>
          </div>
          <span className="platform-revenue-count">{events.length} lançamentos</span>
        </header>

        <div className="platform-revenue-event-list">
          {events.slice(0,50).map(event => (
            <div key={event.id}>
              <span className={'revenue-event-icon '+event.revenue_type}>
                <Icon
                  name={event.revenue_type === 'subscription' ? 'store' : 'route'}
                  size={17}
                />
              </span>
              <span>
                <strong>{revenueLabel[event.revenue_type] ?? event.description ?? 'Receita'}</strong>
                <small>
                  {storeMap.get(event.store_id)?.name ?? 'Plataforma'} · {dateTime(event.occurred_at)}
                </small>
              </span>
              <span>
                <small>Base</small>
                <strong>{money(Number(event.gross_reference_amount ?? 0))}</strong>
              </span>
              <span>
                <small>Regra</small>
                <strong>
                  {event.rate_percent == null
                    ? 'Mensalidade'
                    : Number(event.rate_percent).toFixed(2).replace('.',',')+'%'}
                </strong>
              </span>
              <em className={'platform-revenue-status '+event.status}>
                {event.status === 'paid' ? 'Recebido' : event.status === 'accrued' ? 'A receber' : 'Anulado'}
              </em>
              <strong className="platform-revenue-event-value">
                + {money(Number(event.amount ?? 0))}
              </strong>
            </div>
          ))}

          {!events.length ? (
            <div className="admin-empty">
              Nenhuma receita da plataforma registrada ainda. Ative um modelo de cobrança acima.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
