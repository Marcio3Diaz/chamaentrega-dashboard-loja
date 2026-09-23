'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'

export type OrderSource = 'whatsapp' | 'ifood' | '99food' | 'goomer' | 'own_menu' | 'manual'
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'seeking_courier' | 'in_route' | 'completed' | 'cancelled'

export type OrderItem = {
  name?: string
  quantity?: number
  unit_price?: number
  price?: number
  note?: string
}

export type IntegratedOrder = {
  id: string
  storeId: string
  source: OrderSource
  externalOrderId: string | null
  status: OrderStatus
  fulfillmentType: 'delivery' | 'pickup'
  customerName: string | null
  customerPhone: string | null
  deliveryAddress: string | null
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  items: OrderItem[]
  orderTotal: number
  paymentMethod: string
  paymentStatus: string
  customerNote: string | null
  deliveryId: string | null
  sourceMetadata: Record<string,unknown>
  receivedAt: string
  createdAt: string
  updatedAt: string
}

export type LinkedDelivery = {
  id: string
  status: string
  assignedCourierId: string | null
  deliveryFee: number
  estimatedMinutes: number | null
  updatedAt: string
}

type Props = {
  storeId: string
  initialOrders: IntegratedOrder[]
  initialDeliveries: LinkedDelivery[]
}

type FilterStatus = 'all' | OrderStatus
type FilterSource = 'all' | OrderSource

const statusMeta: Record<OrderStatus,{label:string;className:string;step:number}> = {
  new:{ label:'Novo', className:'new', step:0 },
  preparing:{ label:'Em preparo', className:'preparing', step:1 },
  ready:{ label:'Pronto', className:'ready', step:2 },
  seeking_courier:{ label:'Buscando entregador', className:'seeking', step:3 },
  in_route:{ label:'Em rota', className:'route', step:4 },
  completed:{ label:'Concluído', className:'completed', step:5 },
  cancelled:{ label:'Cancelado', className:'cancelled', step:0 },
}

const sourceMeta: Record<OrderSource,{label:string;logo?:string;className:string}> = {
  whatsapp:{ label:'WhatsApp', logo:'/integrations/whatsapp.svg', className:'whatsapp' },
  ifood:{ label:'iFood', logo:'/integrations/ifood.svg', className:'ifood' },
  '99food':{ label:'99Food', logo:'/integrations/99food.svg', className:'food99' },
  goomer:{ label:'Goomer', logo:'/integrations/goomer.svg', className:'goomer' },
  own_menu:{ label:'Cardápio próprio', className:'own' },
  manual:{ label:'ChamaEntrega', className:'manual' },
}


function shortId(value:string) {
  return value.replaceAll('-','').slice(0,7).toUpperCase()
}

function currency(value:number) {
  return new Intl.NumberFormat('pt-BR',{ style:'currency',currency:'BRL' }).format(value)
}

function onlyTime(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{ hour:'2-digit',minute:'2-digit' }).format(new Date(value))
}

function fullDate(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{ day:'2-digit',month:'2-digit',year:'numeric' }).format(new Date(value))
}

function phone(value:string | null) {
  return value?.trim() || '—'
}

function itemLabel(item:OrderItem) {
  const quantity = Math.max(1,Number(item.quantity ?? 1))
  return `${quantity}x ${item.name?.trim() || 'Item'}`
}

function itemPrice(item:OrderItem) {
  const raw = Number(item.unit_price ?? item.price ?? 0)
  const quantity = Math.max(1,Number(item.quantity ?? 1))
  return raw > 0 ? raw * quantity : null
}

function normalizeDelivery(row:any):LinkedDelivery {
  return {
    id:row.id,
    status:row.status,
    assignedCourierId:row.assigned_courier_id,
    deliveryFee:Number(row.delivery_fee ?? 0),
    estimatedMinutes:row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    updatedAt:row.updated_at,
  }
}

function orderStatusFromDelivery(status:string):OrderStatus {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled' || status === 'expired') return 'cancelled'
  if (['accepted','heading_to_pickup','at_pickup','heading_to_dropoff','at_dropoff'].includes(status)) return 'in_route'
  return 'seeking_courier'
}

function syntheticOrderFromDelivery(row:any,storeId:string):IntegratedOrder {
  const createdAt = row.created_at ?? row.updated_at ?? new Date().toISOString()
  return {
    id:`delivery:${row.id}`,
    storeId:row.store_id ?? storeId,
    source:'manual',
    externalOrderId:row.external_order_id ?? row.id.replaceAll('-','').slice(0,7).toUpperCase(),
    status:orderStatusFromDelivery(row.status),
    fulfillmentType:'delivery',
    customerName:row.customer_name ?? null,
    customerPhone:row.customer_phone ?? null,
    deliveryAddress:row.delivery_address ?? null,
    deliveryLatitude:row.delivery_latitude == null ? null : Number(row.delivery_latitude),
    deliveryLongitude:row.delivery_longitude == null ? null : Number(row.delivery_longitude),
    items:[],
    orderTotal:Number(row.order_total ?? 0),
    paymentMethod:row.payment_method ?? 'unknown',
    paymentStatus:'unknown',
    customerNote:row.customer_note ?? null,
    deliveryId:row.id,
    sourceMetadata:{
      standaloneDelivery:true,
      itemCount:Number(row.item_count ?? 0),
    },
    receivedAt:createdAt,
    createdAt,
    updatedAt:row.updated_at ?? createdAt,
  }
}

function effectiveStatus(order:IntegratedOrder,delivery?:LinkedDelivery):OrderStatus {
  if (!delivery) return order.status
  if (delivery.status === 'completed') return 'completed'
  if (['accepted','heading_to_pickup','at_pickup','heading_to_dropoff','at_dropoff'].includes(delivery.status)) return 'in_route'
  if (['available','negotiating'].includes(delivery.status)) return 'seeking_courier'
  return order.status
}

export function IntegratedOrdersBoard({ storeId,initialOrders,initialDeliveries }:Props) {
  const supabase = useMemo(() => createClient(),[])
  const [orders,setOrders] = useState(initialOrders)
  const [deliveries,setDeliveries] = useState(initialDeliveries)
  const [statusFilter,setStatusFilter] = useState<FilterStatus>('all')
  const [sourceFilter,setSourceFilter] = useState<FilterSource>('all')
  const [search,setSearch] = useState('')
  const [selectedId,setSelectedId] = useState<string | null>(initialOrders[0]?.id ?? null)
  const [page,setPage] = useState(1)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')

  const deliveryMap = useMemo(() => new Map(deliveries.map(item => [item.id,item])),[deliveries])

  const enriched = useMemo(() => orders.map(order => {
    const delivery = order.deliveryId ? deliveryMap.get(order.deliveryId) : undefined
    return { order,delivery,status:effectiveStatus(order,delivery) }
  }),[orders,deliveryMap])

  const counts = useMemo(() => {
    const base:Record<string,number> = { all:enriched.length,new:0,preparing:0,ready:0,seeking_courier:0,in_route:0,completed:0,cancelled:0 }
    enriched.forEach(item => { base[item.status] = (base[item.status] ?? 0) + 1 })
    return base
  },[enriched])

  const sourceCounts = useMemo(() => {
    const base:Record<string,number> = { all:orders.length }
    orders.forEach(item => { base[item.source] = (base[item.source] ?? 0) + 1 })
    return base
  },[orders])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return enriched.filter(({order,status}) => {
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (sourceFilter !== 'all' && order.source !== sourceFilter) return false
      if (!query) return true
      return [
        order.externalOrderId ?? shortId(order.id),
        order.customerName ?? '',
        order.customerPhone ?? '',
        order.deliveryAddress ?? '',
      ].some(value => value.toLocaleLowerCase('pt-BR').includes(query))
    })
  },[enriched,search,sourceFilter,statusFilter])

  const pageSize = 6
  const totalPages = Math.max(1,Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page,totalPages)
  const visible = filtered.slice((safePage - 1) * pageSize,safePage * pageSize)

  const selected = enriched.find(item => item.order.id === selectedId) ?? enriched[0] ?? null

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  },[page,totalPages])

  useEffect(() => {
    const orderChannel = supabase
      .channel(`integrated-orders:${storeId}`)
      .on('postgres_changes',{
        event:'*',
        schema:'public',
        table:'store_orders',
        filter:`store_id=eq.${storeId}`,
      },payload => {
        setOrders(current => {
          if (payload.eventType === 'DELETE') return current.filter(item => item.id !== (payload.old as any).id)
          const row = payload.new as any
          const mapped:IntegratedOrder = {
            id:row.id,
            storeId:row.store_id,
            source:row.source,
            externalOrderId:row.external_order_id,
            status:row.status,
            fulfillmentType:row.fulfillment_type,
            customerName:row.customer_name,
            customerPhone:row.customer_phone,
            deliveryAddress:row.delivery_address,
            deliveryLatitude:row.delivery_latitude == null ? null : Number(row.delivery_latitude),
            deliveryLongitude:row.delivery_longitude == null ? null : Number(row.delivery_longitude),
            items:Array.isArray(row.items) ? row.items : [],
            orderTotal:Number(row.order_total ?? 0),
            paymentMethod:row.payment_method,
            paymentStatus:row.payment_status,
            customerNote:row.customer_note,
            deliveryId:row.delivery_id,
            sourceMetadata:row.source_metadata ?? {},
            receivedAt:row.received_at,
            createdAt:row.created_at,
            updatedAt:row.updated_at,
          }
          const base = mapped.deliveryId
            ? current.filter(item => !(item.id.startsWith('delivery:') && item.deliveryId === mapped.deliveryId))
            : current
          const exists = base.some(item => item.id === mapped.id)
          return (exists ? base.map(item => item.id === mapped.id ? mapped : item) : [mapped,...base])
            .sort((a,b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        })
      })
      .subscribe()

    const deliveryChannel = supabase
      .channel(`integrated-order-deliveries:${storeId}`)
      .on('postgres_changes',{
        event:'*',
        schema:'public',
        table:'deliveries',
        filter:`store_id=eq.${storeId}`,
      },payload => {
        if (payload.eventType === 'DELETE') {
          const removedId = (payload.old as any).id
          setDeliveries(current => current.filter(item => item.id !== removedId))
          setOrders(current => current.filter(item => !(item.id.startsWith('delivery:') && item.deliveryId === removedId)))
          return
        }

        const row = payload.new as any
        const mapped = normalizeDelivery(row)
        setDeliveries(current => {
          const exists = current.some(item => item.id === mapped.id)
          return exists ? current.map(item => item.id === mapped.id ? mapped : item) : [...current,mapped]
        })

        setOrders(current => {
          const hasIntegratedOrder = current.some(item => !item.id.startsWith('delivery:') && item.deliveryId === mapped.id)

          if (hasIntegratedOrder || row.status === 'draft') {
            return current.filter(item => !(item.id.startsWith('delivery:') && item.deliveryId === mapped.id))
          }

          const synthetic = syntheticOrderFromDelivery(row,storeId)
          const exists = current.some(item => item.id === synthetic.id)

          return (exists
            ? current.map(item => item.id === synthetic.id ? synthetic : item)
            : [synthetic,...current]
          ).sort((a,b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(orderChannel)
      void supabase.removeChannel(deliveryChannel)
    }
  },[storeId,supabase])

  function notify(text:string) {
    setMessage(text)
    window.setTimeout(() => setMessage(''),3200)
  }

  async function updateStatus(order:IntegratedOrder,status:OrderStatus) {
    setSaving(true)
    const { error } = await supabase
      .from('store_orders')
      .update({ status })
      .eq('id',order.id)
      .eq('store_id',storeId)
    setSaving(false)

    if (error) {
      notify('Não foi possível atualizar o pedido.')
      return
    }

    setOrders(current => current.map(item => item.id === order.id ? { ...item,status } : item))
    notify('Status do pedido atualizado.')
  }

  const todayKey = new Intl.DateTimeFormat('en-CA', {
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).format(new Date())

  const todayItems = enriched.filter(({order}) =>
    new Intl.DateTimeFormat('en-CA', {
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
    }).format(new Date(order.receivedAt)) === todayKey
  )

  const metrics = {
    total: todayItems.length,
    new: todayItems.filter(item => item.status === 'new').length,
    preparing: todayItems.filter(item => item.status === 'preparing').length,
    ready: todayItems.filter(item => item.status === 'ready').length,
  }

  return (
    <div className="orders-hub-page">
      <section className="orders-hub-hero">
        <div>
          <div className="eyebrow">CAIXA DE ENTRADA UNIFICADA</div>
          <h1>Pedidos <span>Integrados</span></h1>
          <p>Todos os pedidos da sua loja em um só lugar, vindos de WhatsApp, iFood, 99Food, Goomer e cardápio próprio.</p>
        </div>
        <div className="orders-hub-hero-side">
          <span>Mais pedidos.<br/>Mais vendas.<br/>Mais entregas.</span>
          <b><i/>AO VIVO</b>
        </div>
      </section>

      <section className="orders-hub-metrics">
        <article><span className="orders-metric-icon gold">🛒</span><div><small>Total hoje</small><strong>{metrics.total}</strong><span>Pedidos recebidos</span></div></article>
        <article><span className="orders-metric-icon blue">▤</span><div><small>Novos pedidos</small><strong>{metrics.new}</strong><span>Aguardando atendimento</span></div></article>
        <article><span className="orders-metric-icon orange">♨</span><div><small>Em preparo</small><strong>{metrics.preparing}</strong><span>Pedidos em produção</span></div></article>
        <article><span className="orders-metric-icon green">✓</span><div><small>Prontos para entrega</small><strong>{metrics.ready}</strong><span>Aguardando coleta</span></div></article>
      </section>

      <section className="orders-hub-workspace">
        <main className="orders-hub-main">
          <div className="orders-hub-filters">
            <div className="orders-filter-row">
              <strong>Filtrar por status:</strong>
              {([
                ['all','Todos'],
                ['new','Novos'],
                ['preparing','Em preparo'],
                ['ready','Prontos'],
                ['seeking_courier','Buscando entregador'],
                ['in_route','Em rota'],
                ['completed','Concluídos'],
              ] as Array<[FilterStatus,string]>).map(([key,label]) => (
                <button
                  key={key}
                  type="button"
                  className={statusFilter === key ? 'active' : ''}
                  onClick={() => { setStatusFilter(key);setPage(1) }}
                >
                  {label}<b>{counts[key] ?? 0}</b>
                </button>
              ))}
            </div>

            <div className="orders-filter-row source">
              <strong>Filtrar por origem:</strong>
              <button className={sourceFilter === 'all' ? 'active' : ''} onClick={() => {setSourceFilter('all');setPage(1)}}>Todos</button>
              {(Object.keys(sourceMeta) as OrderSource[]).map(key => (
                <button
                  key={key}
                  className={sourceFilter === key ? 'active' : ''}
                  onClick={() => {setSourceFilter(key);setPage(1)}}
                >
                  <OrderSourceMark source={key}/>
                  {sourceMeta[key].label}
                  {sourceCounts[key] ? <b>{sourceCounts[key]}</b> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="orders-hub-table-card">
            <div className="orders-hub-table-search">
              <label><span>⌕</span><input value={search} onChange={e => {setSearch(e.target.value);setPage(1)}} placeholder="Buscar por cliente, pedido ou endereço..." /></label>
            </div>

            <div className="orders-hub-table-wrap">
              <table className="orders-hub-table">
                <thead><tr><th>Origem</th><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Valor</th><th>Status</th><th>Horário</th><th>Entrega</th><th>Ações</th></tr></thead>
                <tbody>
                  {visible.map(({order,delivery,status}) => (
                    <tr key={order.id} className={selected?.order.id === order.id ? 'selected' : ''} onClick={() => setSelectedId(order.id)}>
                      <td><OrderSourceMark source={order.source}/></td>
                      <td><strong>#{order.externalOrderId || shortId(order.id)}</strong></td>
                      <td><b>{order.customerName || 'Cliente'}</b><span>{phone(order.customerPhone)}</span></td>
                      <td>
                        <div className="order-items-preview">
                          {order.items.length ? (
                            <>
                              {order.items.slice(0,2).map((item,index) => <span key={index}>{itemLabel(item)}</span>)}
                              {order.items.length > 2 ? <small>+{order.items.length - 2} item(ns)</small> : null}
                            </>
                          ) : order.sourceMetadata.standaloneDelivery ? (
                            <span className="delivery-grid-label"><Icon name="truck" size={12}/> Enviado ao entregador</span>
                          ) : (
                            <small>Itens não informados</small>
                          )}
                        </div>
                      </td>
                      <td><strong>{currency(order.orderTotal)}</strong></td>
                      <td><span className={`order-status-pill ${statusMeta[status].className}`}>{statusMeta[status].label}</span></td>
                      <td>{onlyTime(order.receivedAt)}</td>
                      <td>
                        <span className={delivery?.assignedCourierId ? 'delivery-grid-state assigned' : 'delivery-grid-state'}>
                          {order.fulfillmentType === 'pickup'
                            ? 'Retirada'
                            : delivery?.assignedCourierId
                              ? 'Com entregador'
                              : status === 'seeking_courier'
                                ? 'Procurando'
                                : 'Entrega'}
                        </span>
                      </td>
                      <td><button className="orders-row-action" type="button" onClick={event => { event.stopPropagation();setSelectedId(order.id) }}>Ver</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!visible.length ? (
                <div className="orders-hub-empty">
                  <span>✦</span>
                  <strong>Nenhum pedido integrado encontrado</strong>
                  <p>Quando WhatsApp, iFood, 99Food, Goomer ou seu cardápio enviarem pedidos, eles aparecerão automaticamente aqui.</p>
                </div>
              ) : null}
            </div>

            <div className="orders-hub-pagination">
              <span>Mostrando {filtered.length ? (safePage - 1) * pageSize + 1 : 0} a {Math.min(safePage * pageSize,filtered.length)} de {filtered.length} pedidos</span>
              <div>
                <button disabled={safePage <= 1} onClick={() => setPage(value => Math.max(1,value - 1))}>‹</button>
                {Array.from({length:Math.min(totalPages,5)},(_,index) => index + 1).map(value => (
                  <button key={value} className={safePage === value ? 'active' : ''} onClick={() => setPage(value)}>{value}</button>
                ))}
                <button disabled={safePage >= totalPages} onClick={() => setPage(value => Math.min(totalPages,value + 1))}>›</button>
              </div>
            </div>
          </div>

          <OrderProgress status={selected?.status ?? 'new'}/>
        </main>

        <aside className="orders-hub-detail">
          {selected ? (
            <OrderDetail
              item={selected}
              saving={saving}
              onStatus={status => void updateStatus(selected.order,status)}
            />
          ) : (
            <div className="orders-detail-empty"><span>☰</span><strong>Selecione um pedido</strong><p>Os detalhes completos aparecerão aqui.</p></div>
          )}
        </aside>
      </section>

      {message ? <div className="orders-hub-toast">{message}</div> : null}
    </div>
  )
}

function OrderSourceMark({source}:{source:OrderSource}) {
  const meta = sourceMeta[source]
  return (
    <span className={`order-source-mark ${meta.className}`}>
      {meta.logo ? <img src={meta.logo} alt={meta.label}/> : <span>{source === 'own_menu' ? 'CE' : '✦'}</span>}
    </span>
  )
}

function OrderProgress({status}:{status:OrderStatus}) {
  const step = statusMeta[status].step
  const steps = [
    ['✓','Recebido'],
    ['♨','Em preparo'],
    ['□','Pedido pronto'],
    ['⌁','Entrega publicada'],
    ['➤','Em rota'],
    ['✓','Entregue'],
  ]
  return (
    <div className="orders-hub-progress">
      <strong>Fluxo do pedido:</strong>
      <div>
        {steps.map(([icon,label],index) => (
          <span key={label} className={index <= step ? 'active' : ''}>
            <i>{icon}</i><b>{label}</b>
          </span>
        ))}
      </div>
      <small>Acompanhe cada etapa do seu pedido em tempo real.</small>
    </div>
  )
}

function OrderDetail({
  item,
  saving,
  onStatus,
}:{
  item:{order:IntegratedOrder;delivery?:LinkedDelivery;status:OrderStatus}
  saving:boolean
  onStatus:(status:OrderStatus)=>void
}) {
  const { order,delivery,status } = item
  const meta = sourceMeta[order.source]

  const primary = (() => {
    if (status === 'new') return <button disabled={saving} onClick={() => onStatus('preparing')}>♨ Marcar como em preparo</button>
    if (status === 'preparing') return <button disabled={saving} onClick={() => onStatus('ready')}>✓ Marcar pedido como pronto</button>
    if (status === 'ready' && order.fulfillmentType === 'delivery') return <Link href={`/entregas/nova?order=${order.id}`}>+ Criar entrega</Link>
    if (status === 'ready' && order.fulfillmentType === 'pickup') return <button disabled={saving} onClick={() => onStatus('completed')}>✓ Marcar como retirado</button>
    if (status === 'seeking_courier') return <Link href="/entregas">Acompanhar busca</Link>
    if (status === 'in_route') return <Link href="/mapa">Acompanhar no mapa</Link>
    return null
  })()

  return (
    <>
      <div className="orders-detail-head">
        <OrderSourceMark source={order.source}/>
        <div><strong>Pedido #{order.externalOrderId || shortId(order.id)}</strong><span>Recebido via <b>{meta.label}</b></span></div>
        <span className={`order-status-pill ${statusMeta[status].className}`}>{statusMeta[status].label}</span>
      </div>

      <div className="orders-detail-time">{onlyTime(order.receivedAt)} · {fullDate(order.receivedAt)}</div>

      <section className="orders-detail-section">
        <span className="orders-detail-icon"><Icon name="user" size={17}/></span>
        <div><small>Cliente</small><strong>{order.customerName || 'Cliente'}</strong><span>{phone(order.customerPhone)}</span></div>
        {order.customerPhone ? <a href={`tel:${order.customerPhone}`} aria-label="Ligar"><Icon name="user" size={15}/></a> : null}
      </section>

      {order.fulfillmentType === 'delivery' ? (
        <section className="orders-detail-section">
          <span className="orders-detail-icon"><Icon name="pin" size={17}/></span>
          <div><small>Endereço de entrega</small><strong>{order.deliveryAddress || 'Endereço não informado'}</strong></div>
        </section>
      ) : (
        <section className="orders-detail-section">
          <span className="orders-detail-icon"><Icon name="store" size={17}/></span>
          <div><small>Retirada</small><strong>Cliente retira na loja</strong></div>
        </section>
      )}

      <section className="orders-detail-items">
        <div className="orders-detail-section-title"><Icon name="box" size={16}/>Itens do pedido</div>
        {order.items.length ? order.items.map((item,index) => (
          <div className="orders-detail-item" key={index}>
            <span>{itemLabel(item)}{item.note ? <small>{item.note}</small> : null}</span>
            {itemPrice(item) != null ? <strong>{currency(itemPrice(item)!)}</strong> : null}
          </div>
        )) : <p className="orders-detail-muted">Itens não informados pela integração.</p>}
      </section>

      {order.customerNote ? (
        <section className="orders-detail-note">
          <div className="orders-detail-section-title"><Icon name="chat" size={16}/>Observações do cliente</div>
          <p>“{order.customerNote}”</p>
        </section>
      ) : null}

      <section className="orders-detail-payment">
        <div><span className="orders-detail-icon"><Icon name="money" size={17}/></span><span><small>Pagamento</small><strong>{paymentLabel(order.paymentMethod)}</strong></span></div>
        <b className={order.paymentStatus === 'paid' ? 'paid' : ''}>{paymentStatusLabel(order.paymentStatus)}</b>
      </section>

      {delivery ? (
        <section className="orders-detail-delivery">
          <span><Icon name="truck" size={16}/>Entrega vinculada</span>
          <strong>#{shortId(delivery.id)}</strong>
          <small>{statusMeta[effectiveStatus(order,delivery)].label}{delivery.estimatedMinutes ? ` · ~${delivery.estimatedMinutes} min` : ''}</small>
        </section>
      ) : null}

      <div className="orders-detail-total"><span>Total do pedido</span><strong>{currency(order.orderTotal)}</strong></div>

      <div className="orders-detail-actions">
        {!['completed','cancelled'].includes(status) ? <button className="secondary" disabled={saving} onClick={() => onStatus('cancelled')}>Cancelar pedido</button> : null}
        {primary ? <div className="primary">{primary}</div> : null}
      </div>
    </>
  )
}

function paymentLabel(value:string) {
  const labels:Record<string,string> = {
    pix:'Pix',
    cash:'Dinheiro',
    card:'Cartão',
    card_on_delivery:'Cartão na entrega',
    already_paid:'Já pago',
    unknown:'Não informado',
  }
  return labels[value] ?? value
}

function paymentStatusLabel(value:string) {
  const labels:Record<string,string> = {
    paid:'Pago',
    pending:'Pendente',
    failed:'Falhou',
    refunded:'Estornado',
    unknown:'Não informado',
  }
  return labels[value] ?? value
}
