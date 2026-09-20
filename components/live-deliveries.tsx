'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { currency, shortId } from '@/lib/format'
import type { Delivery } from '@/lib/types'
import { StatusBadge } from './status-badge'
import { Icon } from './icon'

function onlyTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function LiveDeliveries({ storeId, initialDeliveries, limit }: { storeId: string; initialDeliveries: Delivery[]; limit?: number }) {
  const [deliveries, setDeliveries] = useState(initialDeliveries)
  const shown = useMemo(() => limit ? deliveries.slice(0, limit) : deliveries, [deliveries, limit])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`store-deliveries:${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `store_id=eq.${storeId}` }, payload => {
        setDeliveries(current => {
          if (payload.eventType === 'DELETE') return current.filter(row => row.id !== (payload.old as Delivery).id)
          const row = payload.new as Delivery
          const index = current.findIndex(item => item.id === row.id)
          const next = index >= 0 ? current.map(item => item.id === row.id ? row : item) : [row, ...current]
          return next.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        })
      }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [storeId])

  if (!shown.length) return <div className="empty premium-empty">Nenhuma entrega encontrada.</div>

  return <div className="table-wrap"><table className="table premium-table">
    <thead><tr><th>#</th><th>Cliente</th><th>Endereço</th><th>Status</th><th>Taxa</th><th>Horário</th><th>Ações</th></tr></thead>
    <tbody>{shown.map(delivery => <tr key={delivery.id}>
      <td><strong>#{shortId(delivery.id)}</strong></td>
      <td><div className="table-main">{delivery.customer_name ?? 'Cliente'}</div><div className="table-sub">{delivery.customer_phone ?? '—'}</div></td>
      <td><div className="table-address">{delivery.delivery_address}</div></td>
      <td><StatusBadge status={delivery.status} /></td>
      <td><strong>{currency(Number(delivery.delivery_fee))}</strong></td>
      <td>{onlyTime(delivery.updated_at)}</td>
      <td>
        <div className="delivery-table-actions">
          {delivery.assigned_courier_id ? (
            <Link
              href={`/chat?delivery=${delivery.id}`}
              className="delivery-chat-action"
              aria-label="Abrir chat com entregador"
              title="Abrir chat"
            >
              <Icon name="chat" size={15}/>
            </Link>
          ) : null}
          <button className="table-more" aria-label="Mais ações">⋮</button>
        </div>
      </td>
    </tr>)}</tbody>
  </table></div>
}
