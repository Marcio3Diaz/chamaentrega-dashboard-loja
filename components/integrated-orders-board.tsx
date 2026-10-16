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
  assignedCourierName: string | null
  assignedCourierVehicle: string | null
  assignedCourierAvatarUrl: string | null
  deliveryFee: number
  estimatedMinutes: number | null
  updatedAt: string
}

type Props = {
  storeId: string
  initialOrders: IntegratedOrder[]
  initialDeliveries: LinkedDelivery[]
  initialSelectedId?: string | null
  initialMessage?: string
  initialSearch?: string
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

function vehicleLabel(value:string | null) {
  if (value === 'motorcycle') return 'Moto'
  if (value === 'bike') return 'Bicicleta'
  if (value === 'car') return 'Carro'
  return 'Veículo não informado'
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

function normalizeDelivery(row:any,previous?:LinkedDelivery):LinkedDelivery {
  const sameCourier = previous?.assignedCourierId && previous.assignedCourierId === row.assigned_courier_id

  return {
    id:row.id,
    status:row.status,
    assignedCourierId:row.assigned_courier_id,
    assignedCourierName:sameCourier ? previous?.assignedCourierName ?? null : null,
    assignedCourierVehicle:sameCourier ? previous?.assignedCourierVehicle ?? null : null,
    assignedCourierAvatarUrl:sameCourier ? previous?.assignedCourierAvatarUrl ?? null : null,
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

export function IntegratedOrdersBoard({
  storeId,
  initialOrders,
  initialDeliveries,
  initialSelectedId = null,
  initialMessage = '',
  initialSearch = '',
}:Props) {
  const supabase = useMemo(() => createClient(),[])
  const [orders,setOrders] = useState(initialOrders)
  const [deliveries,setDeliveries] = useState(initialDeliveries)
  const [statusFilter,setStatusFilter] = useState<FilterStatus>('all')
  const [sourceFilter,setSourceFilter] = useState<FilterSource>('all')
  const [search,setSearch] = useState(initialSearch)
  const [selectedId,setSelectedId] = useState<string | null>(() =>
    initialSelectedId && initialOrders.some(order => order.id === initialSelectedId)
      ? initialSelectedId
      : initialOrders[0]?.id ?? null
  )
  const [page,setPage] = useState(1)
  const [message,setMessage] = useState(initialMessage)

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
    setSearch(initialSearch)
    setPage(1)
  },[initialSearch])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  },[page,totalPages])

  useEffect(() => {
    const missingIds = Array.from(new Set(
      deliveries
        .filter(item => item.assignedCourierId && !item.assignedCourierName)
        .map(item => item.assignedCourierId!)
    ))

    if (!missingIds.length) return

    let cancelled = false

    const hydrateCouriers = async () => {
      const [{ data:courierRows },{ data:profileRows }] = await Promise.all([
        supabase.from('couriers').select('id,vehicle_type').in('id',missingIds),
        supabase.from('profiles').select('id,full_name,avatar_url').in('id',missingIds),
      ])

      if (cancelled) return

      const courierMap = new Map((courierRows ?? []).map((row:any) => [row.id,row]))
      const profileMap = new Map((profileRows ?? []).map((row:any) => [row.id,row]))

      setDeliveries(current => current.map(item => {
        if (!item.assignedCourierId || !missingIds.includes(item.assignedCourierId)) return item
        const courier = courierMap.get(item.assignedCourierId)
        const profile = profileMap.get(item.assignedCourierId)

        return {
          ...item,
          assignedCourierName:profile?.full_name ?? 'Entregador parceiro',
          assignedCourierVehicle:courier?.vehicle_type ?? null,
          assignedCourierAvatarUrl:profile?.avatar_url ?? null,
        }
      }))
    }

    void hydrateCouriers()

    return () => {
      cancelled = true
    }
  },[deliveries,supabase])

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
        let mapped:LinkedDelivery | null = null
        setDeliveries(current => {
          const previous = current.find(item => item.id === row.id)
          mapped = normalizeDelivery(row,previous)
          const exists = current.some(item => item.id === mapped!.id)
          return exists ? current.map(item => item.id === mapped!.id ? mapped! : item) : [...current,mapped!]
        })

        setOrders(current => {
          const hasLinkedOrder = current.some(item => item.deliveryId === row.id)
          if (hasLinkedOrder || row.status === 'draft') return current

          const synthetic = syntheticOrderFromDelivery(row,storeId)
          const exists = current.some(item => item.id === synthetic.id)
          const next = exists
            ? current.map(item => item.id === synthetic.id ? synthetic : item)
            : [synthetic,...current]
          return next.sort((a,b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(orderChannel)
      void supabase.removeChannel(deliveryChannel)
    }
  },[storeId,supabase])

  const statusButtons:FilterStatus[] = ['all','new','preparing','ready','seeking_courier','in_route','completed','cancelled']
  const sourceButtons:FilterSource[] = ['all','whatsapp','ifood','99food','goomer','own_menu','manual']

  return (
    <div className="orders-board-page">
      <section className="orders-board-head">
        <div>
          <span className="orders-kicker">OPERAÇÃO</span>
          <h1>Pedidos</h1>
          <p>Todos os canais em uma única fila operacional.</p>
        </div>
        <Link href="/entregas/nova" className="button button-gold"><Icon name="plus" size={16}/> NOVA ENTREGA</Link>
      </section>

      {message ? <div className="notice">{message}</div> : null}

      <section className="orders-toolbar">
        <div className="orders-search-box">
          <Icon name="search" size={17}/>
          <input
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1) }}
            placeholder="Buscar pedido, cliente, telefone ou endereço..."
          />
        </div>

        <div className="orders-source-filter">
          <span>Filtrar por origem</span>
          <div>
            {sourceButtons.map(source => (
              <button
                key={source}
                type="button"
                className={sourceFilter === source ? 'active' : ''}
                onClick={() => { setSourceFilter(source); setPage(1) }}
              >
                {source === 'all' ? 'Todos' : sourceMeta[source].label}
                <b>{sourceCounts[source] ?? 0}</b>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="orders-status-tabs">
        {statusButtons.map(status => (
          <button
            key={status}
            type="button"
            className={statusFilter === status ? 'active' : ''}
            onClick={() => { setStatusFilter(status); setPage(1) }}
          >
            {status === 'all' ? 'Todos' : statusMeta[status].label}
            <b>{counts[status] ?? 0}</b>
          </button>
        ))}
      </section>

      <section className="orders-workspace">
        <div className="orders-grid-list">
          {visible.map(({order,delivery,status}) => {
            const meta = statusMeta[status]
            const source = sourceMeta[order.source]
            return (
              <button
                type="button"
                key={order.id}
                className={selected?.order.id === order.id ? 'order-card active' : 'order-card'}
                onClick={() => setSelectedId(order.id)}
              >
                <span className="order-card-topline">
                  <span className={`order-source ${source.className}`}>
                    {source.logo ? <img src={source.logo} alt=""/> : <Icon name="store" size={12}/>} {source.label}
                  </span>
                  <span className={`order-status ${meta.className}`}>{meta.label}</span>
                </span>
                <strong>#{order.externalOrderId ?? shortId(order.id)}</strong>
                <span className="order-customer">{order.customerName ?? 'Cliente'}</span>
                <span className="order-address">{order.deliveryAddress ?? 'Retirada no local'}</span>
                <span className="order-card-footer">
                  <b>{currency(order.orderTotal)}</b>
                  <small>{onlyTime(order.receivedAt)}</small>
                </span>
                {delivery?.assignedCourierName ? (
                  <span className="order-courier-inline">
                    {delivery.assignedCourierAvatarUrl ? <img src={delivery.assignedCourierAvatarUrl} alt=""/> : <i>{delivery.assignedCourierName.slice(0,1)}</i>}
                    {delivery.assignedCourierName}
                  </span>
                ) : null}
              </button>
            )
          })}

          {!visible.length ? <div className="empty premium-empty">Nenhum pedido encontrado com os filtros atuais.</div> : null}

          {totalPages > 1 ? (
            <div className="orders-pagination">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(value => Math.max(1,value - 1))}>Anterior</button>
              <span>{safePage} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(value => Math.min(totalPages,value + 1))}>Próxima</button>
            </div>
          ) : null}
        </div>

        <aside className="order-detail-panel">
          {selected ? (
            <>
              <div className="order-detail-head">
                <div>
                  <span>{sourceMeta[selected.order.source].label}</span>
                  <h2>#{selected.order.externalOrderId ?? shortId(selected.order.id)}</h2>
                  <small>{fullDate(selected.order.receivedAt)} · {onlyTime(selected.order.receivedAt)}</small>
                </div>
                <span className={`order-status ${statusMeta[selected.status].className}`}>{statusMeta[selected.status].label}</span>
              </div>

              <div className="order-detail-section">
                <small>CLIENTE</small>
                <strong>{selected.order.customerName ?? 'Cliente'}</strong>
                <span>{phone(selected.order.customerPhone)}</span>
                <p>{selected.order.deliveryAddress ?? 'Retirada no local'}</p>
              </div>

              <div className="order-detail-section">
                <small>ITENS</small>
                {selected.order.items.length ? selected.order.items.map((item,index) => (
                  <div className="order-item-row" key={`${item.name ?? 'item'}-${index}`}>
                    <span>{itemLabel(item)}</span>
                    <b>{itemPrice(item) == null ? '—' : currency(itemPrice(item)!)}</b>
                  </div>
                )) : <span className="order-empty-items">Itens não informados nesta origem.</span>}
              </div>

              {selected.delivery ? (
                <div className="order-detail-section">
                  <small>ENTREGA</small>
                  <strong>{selected.delivery.assignedCourierName ?? 'Buscando entregador'}</strong>
                  <span>{vehicleLabel(selected.delivery.assignedCourierVehicle)}</span>
                  <div className="order-detail-actions">
                    {selected.delivery.assignedCourierId ? <Link href={`/chat?delivery=${selected.delivery.id}`}><Icon name="chat" size={15}/> Chat</Link> : null}
                    <Link href={selected.delivery.assignedCourierId ? `/mapa?delivery=${selected.delivery.id}` : `/despacho?delivery=${selected.delivery.id}`}>
                      <Icon name={selected.delivery.assignedCourierId ? 'map' : 'route'} size={15}/>
                      {selected.delivery.assignedCourierId ? 'Mapa' : 'Despachar'}
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="order-total-box">
                <span>Total do pedido</span>
                <strong>{currency(selected.order.orderTotal)}</strong>
              </div>
            </>
          ) : <div className="empty premium-empty">Selecione um pedido para ver os detalhes.</div>}
        </aside>
      </section>
    </div>
  )
}
