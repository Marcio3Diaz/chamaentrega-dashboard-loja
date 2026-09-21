'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icon'
import { setStoreActiveAdminAction } from '@/app/(admin)/admin/actions'

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
  const [statusFilter,setStatusFilter] = useState<'all'|'active'|'paused'>('all')
  const [sort,setSort] = useState<'recent'|'name'|'deliveries'|'balance'>('recent')
  const [message,setMessage] = useState('')
  const [pending,startTransition] = useTransition()

  const stores = useMemo(() => {
    const term = search.trim().toLowerCase()

    const filtered = initialStores.filter(store => {
      const matchesSearch = !term || [
        store.name,
        store.ownerName,
        store.city ?? '',
        store.state ?? '',
        store.phone ?? '',
      ].some(value => value.toLowerCase().includes(term))

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && store.isActive) ||
        (statusFilter === 'paused' && !store.isActive)

      return matchesSearch && matchesStatus
    })

    return [...filtered].sort((a,b) => {
      if (sort === 'name') return a.name.localeCompare(b.name,'pt-BR')
      if (sort === 'deliveries') return b.totalDeliveries-a.totalDeliveries
      if (sort === 'balance') return b.walletBalance-a.walletBalance
      return new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()
    })
  },[initialStores,search,statusFilter,sort])

  const activeCount = initialStores.filter(store => store.isActive).length
  const pausedCount = initialStores.length-activeCount

  function toggle(store:AdminStoreRow) {
    setMessage('')
    startTransition(async () => {
      const result = await setStoreActiveAdminAction(store.id,!store.isActive)
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }


  return (
    <div className="admin-stores-panel">
      <div className="admin-table-toolbar admin-store-toolbar-v2">
        <div className="admin-search">
          <Icon name="search" size={18}/>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar loja, responsável, telefone ou cidade..."
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca">×</button>
          ) : null}
        </div>

        <div className="admin-store-filter-chips">
          <button
            type="button"
            className={statusFilter==='all' ? 'active' : ''}
            onClick={() => setStatusFilter('all')}
          >
            Todas <span>{initialStores.length}</span>
          </button>
          <button
            type="button"
            className={statusFilter==='active' ? 'active' : ''}
            onClick={() => setStatusFilter('active')}
          >
            Ativas <span>{activeCount}</span>
          </button>
          <button
            type="button"
            className={statusFilter==='paused' ? 'active' : ''}
            onClick={() => setStatusFilter('paused')}
          >
            Pausadas <span>{pausedCount}</span>
          </button>
        </div>

        <label className="admin-store-sort">
          <span>Ordenar</span>
          <select value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
            <option value="recent">Mais recentes</option>
            <option value="name">Nome A–Z</option>
            <option value="deliveries">Mais entregas</option>
            <option value="balance">Maior saldo</option>
          </select>
        </label>
      </div>

      <div className="admin-store-result-line">
        <strong>{stores.length}</strong> operação{stores.length===1?'':'ões'} encontrada{stores.length===1?'':'s'}
        {(search || statusFilter !== 'all') ? (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setSort('recent')
            }}
          >
            Limpar filtros
          </button>
        ) : null}
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
                className="admin-row-button admin-row-link admin-row-primary"
              >
                <Icon name="chevron" size={14}/>
                Abrir gestão
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
