'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'
import {
  selectStoreForAdminAction,
  setStoreActiveAdminAction,
} from '@/app/(admin)/admin/actions'

export type AdminStoreRow = {
  id:string
  name:string
  logoUrl:string|null
  phone:string|null
  city:string|null
  state:string|null
  address:string
  isActive:boolean
  createdAt:string
  ownerName:string
  walletBalance:number
  walletReserved:number
  totalDeliveries:number
  completedDeliveries:number
  activeDeliveries:number
  deliveryVolume:number
}

function money(value:number) {
  return new Intl.NumberFormat('pt-BR',{
    style:'currency',
    currency:'BRL',
  }).format(value)
}

function date(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    year:'2-digit',
  }).format(new Date(value))
}

export function AdminStoresPanel({
  initialStores,
}:{
  initialStores:AdminStoreRow[]
}) {
  const [search,setSearch] = useState('')
  const [message,setMessage] = useState('')
  const [pending,startTransition] = useTransition()

  const stores = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return initialStores

    return initialStores.filter(store =>
      [
        store.name,
        store.ownerName,
        store.city ?? '',
        store.state ?? '',
        store.phone ?? '',
      ].some(value => value.toLowerCase().includes(term))
    )
  },[initialStores,search])

  function toggle(store:AdminStoreRow) {
    setMessage('')
    startTransition(async () => {
      const result = await setStoreActiveAdminAction(store.id,!store.isActive)
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  function openStore(storeId:string) {
    setMessage('')
    startTransition(async () => {
      const result = await selectStoreForAdminAction(storeId)
      if (result.ok) {
        router.push('/painel')
        router.refresh()
        return
      }
      setMessage(result.message)
    })
  }

  return (
    <div className="admin-stores-panel">
      <div className="admin-table-toolbar">
        <div className="admin-search">
          <Icon name="search" size={16}/>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por loja, responsável ou cidade..."
          />
        </div>
        <span>{stores.length} loja{stores.length===1?'':'s'}</span>
      </div>

      {message ? <div className="admin-inline-message">{message}</div> : null}

      <div className="admin-store-list">
        {stores.map(store => (
          <article className="admin-store-row" key={store.id}>
            <div className="admin-store-identity">
              <span className="admin-store-logo">
                {store.logoUrl
                  ? <img src={store.logoUrl} alt=""/>
                  : store.name.slice(0,2).toUpperCase()}
              </span>
              <div>
                <strong>{store.name}</strong>
                <small>
                  {store.city && store.state
                    ? `${store.city} · ${store.state}`
                    : store.address}
                </small>
                <em>Desde {date(store.createdAt)} · {store.ownerName}</em>
              </div>
            </div>

            <div className="admin-store-stat">
              <small>Carteira</small>
              <strong>{money(store.walletBalance)}</strong>
              <span>{money(store.walletReserved)} reservado</span>
            </div>

            <div className="admin-store-stat">
              <small>Entregas</small>
              <strong>{store.totalDeliveries}</strong>
              <span>{store.activeDeliveries} ativas · {store.completedDeliveries} concluídas</span>
            </div>

            <div className="admin-store-stat">
              <small>Volume</small>
              <strong>{money(store.deliveryVolume)}</strong>
              <span>taxas movimentadas</span>
            </div>

            <div className="admin-store-actions">
              <span className={store.isActive ? 'admin-status active' : 'admin-status paused'}>
                <i/>{store.isActive ? 'Ativa' : 'Pausada'}
              </span>

              <Link
                href={`/admin/lojas/${store.id}`}
                className="admin-row-button admin-row-link"
              >
                Detalhes
              </Link>

              <button
                type="button"
                className={store.isActive ? 'admin-row-button danger' : 'admin-row-button success'}
                onClick={() => toggle(store)}
                disabled={pending}
              >
                {store.isActive ? 'Pausar' : 'Ativar'}
              </button>
            </div>
          </article>
        ))}

        {!stores.length ? (
          <div className="admin-empty">
            Nenhuma loja encontrada.
          </div>
        ) : null}
      </div>
    </div>
  )
}
