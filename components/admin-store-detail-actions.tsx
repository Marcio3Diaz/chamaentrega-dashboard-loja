'use client'

import { useState, useTransition } from 'react'
import { Icon } from '@/components/icon'
import {
  setStoreModerationStatusAdminAction,
  type ModerationStatus,
} from '@/app/(admin)/admin/actions'

export function AdminStoreDetailActions({
  storeId,
  moderationStatus,
  storeName,
  moderationReason,
}:{
  storeId:string
  moderationStatus:ModerationStatus
  storeName:string
  moderationReason:string|null
}) {
  const [pending,startTransition] = useTransition()
  const [message,setMessage] = useState('')

  function moderate(status:ModerationStatus) {
    if (pending) return

    let reason:string|undefined
    const destructive = status === 'suspended' || status === 'banned' || status === 'rejected'

    if (destructive) {
      const verb =
        status === 'suspended'
          ? 'suspender'
          : status === 'banned'
            ? 'banir'
            : 'rejeitar'

      if (!window.confirm(`Deseja realmente ${verb} "${storeName}"?`)) return

      const answer = window.prompt(
        'Motivo administrativo:',
        moderationReason ?? '',
      )
      if (answer === null) return
      reason = answer.trim() || undefined
    } else {
      const verb = moderationStatus === 'pending' ? 'aprovar' : 'ativar'
      if (!window.confirm(`Deseja ${verb} "${storeName}"?`)) return
    }

    setMessage('')
    startTransition(async () => {
      const result = await setStoreModerationStatusAdminAction(
        storeId,
        status,
        reason,
      )
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }

  return (
    <div className="admin-store-detail-actions moderation-detail-actions">
      {moderationStatus === 'pending' ? (
        <>
          <button
            type="button"
            className="admin-store-success-action"
            onClick={() => moderate('active')}
            disabled={pending}
          >
            <Icon name="check" size={16}/>
            Aprovar cadastro
          </button>
          <button
            type="button"
            className="admin-store-danger-action"
            onClick={() => moderate('rejected')}
            disabled={pending}
          >
            Rejeitar cadastro
          </button>
        </>
      ) : moderationStatus === 'active' ? (
        <>
          <button
            type="button"
            className="admin-store-warning-action"
            onClick={() => moderate('suspended')}
            disabled={pending}
          >
            <Icon name="pause" size={16}/>
            Suspender
          </button>
          <button
            type="button"
            className="admin-store-danger-action"
            onClick={() => moderate('banned')}
            disabled={pending}
          >
            Banir loja
          </button>
        </>
      ) : (
        <button
          type="button"
          className="admin-store-success-action"
          onClick={() => moderate('active')}
          disabled={pending}
        >
          <Icon name="check" size={16}/>
          Ativar loja
        </button>
      )}

      {message ? <span className="admin-store-action-message">{message}</span> : null}
    </div>
  )
}
