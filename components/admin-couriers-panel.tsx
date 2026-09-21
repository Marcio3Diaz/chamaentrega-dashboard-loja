'use client'

import { useMemo, useState, useTransition } from 'react'
import { Icon } from '@/components/icon'
import {
  setCourierModerationStatusAdminAction,
  type ModerationStatus,
} from '@/app/(admin)/admin/actions'

export type AdminCourierRow = {
  id:string
  fullName:string
  phone:string|null
  avatarUrl:string|null
  vehicleType:string
  isOnline:boolean
  isAvailable:boolean
  rating:number
  totalDeliveries:number
  currentLatitude:number|null
  currentLongitude:number|null
  lastLocationAt:string|null
  createdAt:string
  moderationStatus:ModerationStatus
  moderationReason:string|null
  approvedAt:string|null
  verificationStatus:string|null
  activeDelivery:{
    storeName:string
    customerName:string
    status:string
  }|null
}

const statusLabel:Record<ModerationStatus,string> = {
  pending:'Aguardando aprovação',
  active:'Ativo',
  suspended:'Suspenso',
  banned:'Banido',
  rejected:'Rejeitado',
}

const verificationLabel:Record<string,string> = {
  not_started:'Não iniciada',
  draft:'Documentos incompletos',
  under_review:'Documentos em análise',
  approved:'Documentos aprovados',
  correction_required:'Correção solicitada',
}

function dateTime(value:string|null) {
  if (!value) return 'Sem GPS'
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
  }).format(new Date(value))
}

function registrationDate(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    year:'2-digit',
  }).format(new Date(value))
}

export function AdminCouriersPanel({
  initialCouriers,
}:{
  initialCouriers:AdminCourierRow[]
}) {
  const [search,setSearch] = useState('')
  const [statusFilter,setStatusFilter] = useState<'all'|ModerationStatus>('all')
  const [message,setMessage] = useState('')
  const [workingId,setWorkingId] = useState<string|null>(null)
  const [pending,startTransition] = useTransition()

  const counts = useMemo(() => {
    const result:Record<ModerationStatus,number> = {
      pending:0,
      active:0,
      suspended:0,
      banned:0,
      rejected:0,
    }
    for (const courier of initialCouriers) result[courier.moderationStatus] += 1
    return result
  },[initialCouriers])

  const couriers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return initialCouriers.filter(courier => {
      const searchMatch = !term || [
        courier.fullName,
        courier.phone ?? '',
        courier.vehicleType,
      ].some(value => value.toLowerCase().includes(term))

      const statusMatch =
        statusFilter === 'all' ||
        courier.moderationStatus === statusFilter

      return searchMatch && statusMatch
    })
  },[initialCouriers,search,statusFilter])

  function moderate(courier:AdminCourierRow,status:ModerationStatus) {
    if (pending || workingId) return

    let reason:string|undefined
    const destructive = status === 'suspended' || status === 'banned' || status === 'rejected'

    if (destructive) {
      const verb =
        status === 'suspended'
          ? 'suspender'
          : status === 'banned'
            ? 'banir'
            : 'rejeitar'

      if (!window.confirm(`Deseja realmente ${verb} "${courier.fullName}"?`)) {
        return
      }

      const answer = window.prompt(
        'Informe o motivo administrativo. Ele ficará registrado no histórico:',
        courier.moderationReason ?? '',
      )
      if (answer === null) return
      reason = answer.trim() || undefined
    } else {
      const verb = courier.moderationStatus === 'pending'
        ? 'aprovar o cadastro'
        : 'reativar o cadastro'

      if (!window.confirm(`Deseja ${verb} de "${courier.fullName}"?`)) {
        return
      }
    }

    setMessage('')
    setWorkingId(courier.id)

    startTransition(async () => {
      const result = await setCourierModerationStatusAdminAction(
        courier.id,
        status,
        reason,
      )
      setMessage(result.message)
      setWorkingId(null)

      if (result.ok) window.location.reload()
    })
  }

  function actions(courier:AdminCourierRow) {
    const busy = pending && workingId === courier.id

    if (courier.moderationStatus === 'pending') {
      return (
        <>
          <button
            type="button"
            className="admin-row-button success"
            disabled={busy}
            onClick={() => moderate(courier,'active')}
          >
            <Icon name="check" size={14}/> Aprovar
          </button>
          <button
            type="button"
            className="admin-row-button warning"
            disabled={busy}
            onClick={() => moderate(courier,'rejected')}
          >
            Rejeitar
          </button>
          <button
            type="button"
            className="admin-row-button danger"
            disabled={busy}
            onClick={() => moderate(courier,'banned')}
          >
            Banir
          </button>
        </>
      )
    }

    if (courier.moderationStatus === 'active') {
      return (
        <>
          <button
            type="button"
            className="admin-row-button warning"
            disabled={busy}
            onClick={() => moderate(courier,'suspended')}
          >
            Suspender
          </button>
          <button
            type="button"
            className="admin-row-button danger"
            disabled={busy}
            onClick={() => moderate(courier,'banned')}
          >
            Banir
          </button>
        </>
      )
    }

    return (
      <button
        type="button"
        className="admin-row-button success"
        disabled={busy}
        onClick={() => moderate(courier,'active')}
      >
        <Icon name="check" size={14}/> Ativar
      </button>
    )
  }

  return (
    <div className="admin-courier-moderation-panel">
      <div className="admin-courier-toolbar">
        <div className="admin-search">
          <Icon name="search" size={18}/>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar entregador, telefone ou veículo..."
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca">×</button>
          ) : null}
        </div>

        <div className="admin-store-filter-chips moderation-filter-chips">
          <button
            type="button"
            className={statusFilter==='all' ? 'active' : ''}
            onClick={() => setStatusFilter('all')}
          >
            Todos <span>{initialCouriers.length}</span>
          </button>
          <button
            type="button"
            className={statusFilter==='pending' ? 'active pending' : ''}
            onClick={() => setStatusFilter('pending')}
          >
            Pendentes <span>{counts.pending}</span>
          </button>
          <button
            type="button"
            className={statusFilter==='active' ? 'active' : ''}
            onClick={() => setStatusFilter('active')}
          >
            Ativos <span>{counts.active}</span>
          </button>
          <button
            type="button"
            className={statusFilter==='suspended' ? 'active suspended' : ''}
            onClick={() => setStatusFilter('suspended')}
          >
            Suspensos <span>{counts.suspended}</span>
          </button>
          <button
            type="button"
            className={statusFilter==='banned' ? 'active banned' : ''}
            onClick={() => setStatusFilter('banned')}
          >
            Banidos <span>{counts.banned}</span>
          </button>
        </div>
      </div>

      <div className="admin-store-result-line">
        <strong>{couriers.length}</strong> entregador{couriers.length===1?'':'es'}
        {counts.pending ? (
          <span className="admin-pending-summary"><i/>{counts.pending} aguardando aprovação</span>
        ) : null}
        {(search || statusFilter !== 'all') ? (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
            }}
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {message ? <div className="admin-inline-message">{message}</div> : null}

      <div className="admin-courier-list admin-courier-list-v2">
        {couriers.map(courier => (
          <article className="admin-courier-row admin-courier-row-v2" key={courier.id}>
            <div className="admin-courier-id">
              <span className="admin-courier-avatar">
                {courier.avatarUrl
                  ? <img src={courier.avatarUrl} alt=""/>
                  : courier.fullName.slice(0,1)}
              </span>
              <span>
                <strong>{courier.fullName}</strong>
                <small>{courier.phone ?? 'Telefone não informado'}</small>
                <em>
                  {courier.vehicleType === 'bike' ? 'Bicicleta' : 'Motocicleta'} · cadastro {registrationDate(courier.createdAt)}
                </em>
              </span>
            </div>

            <div className="admin-courier-stat">
              <small>Avaliação</small>
              <strong>★ {courier.rating.toFixed(1)}</strong>
              <span>{courier.totalDeliveries} entregas</span>
            </div>

            <div className="admin-courier-stat">
              <small>Documentação</small>
              <strong>{verificationLabel[courier.verificationStatus ?? 'not_started'] ?? courier.verificationStatus ?? 'Não iniciada'}</strong>
              <span>GPS: {dateTime(courier.lastLocationAt)}</span>
            </div>

            <div className="admin-courier-current">
              {courier.activeDelivery ? (
                <>
                  <small>CORRIDA ATIVA</small>
                  <strong>{courier.activeDelivery.storeName}</strong>
                  <span>{courier.activeDelivery.customerName} · {courier.activeDelivery.status}</span>
                </>
              ) : (
                <>
                  <small>OPERAÇÃO</small>
                  <strong>
                    {courier.moderationStatus !== 'active'
                      ? statusLabel[courier.moderationStatus]
                      : courier.isOnline
                        ? courier.isAvailable ? 'Disponível' : 'Ocupado'
                        : 'Offline'}
                  </strong>
                  <span>Sem corrida ativa</span>
                </>
              )}
            </div>

            <div className="admin-courier-moderation">
              <span className={`admin-moderation-status ${courier.moderationStatus}`}>
                <i/>{statusLabel[courier.moderationStatus]}
              </span>
              {courier.moderationReason ? (
                <small title={courier.moderationReason}>{courier.moderationReason}</small>
              ) : null}
            </div>

            <div className="moderation-actions courier-moderation-actions">
              {actions(courier)}
            </div>
          </article>
        ))}

        {!couriers.length ? (
          <div className="admin-empty">
            <Icon name="user" size={24}/>
            Nenhum entregador encontrado.
          </div>
        ) : null}
      </div>
    </div>
  )
}
