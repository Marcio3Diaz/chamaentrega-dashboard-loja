'use client'

import { useState, useTransition } from 'react'
import { Icon } from '@/components/icon'
import { setStoreActiveAdminAction } from '@/app/(admin)/admin/actions'

export function AdminStoreDetailActions({
  storeId,
  isActive,
}:{
  storeId:string
  isActive:boolean
}) {
  const [pending,startTransition] = useTransition()
  const [message,setMessage] = useState('')

  function toggleStore() {
    setMessage('')
    startTransition(async () => {
      const result = await setStoreActiveAdminAction(storeId,!isActive)
      setMessage(result.message)
      if (result.ok) window.location.reload()
    })
  }

  return (
    <div className="admin-store-detail-actions">
      <button
        type="button"
        className={isActive ? 'admin-store-danger-action' : 'admin-store-success-action'}
        onClick={toggleStore}
        disabled={pending}
      >
        <Icon name={isActive ? 'pause' : 'check'} size={16}/>
        {isActive ? 'Pausar operação' : 'Reativar operação'}
      </button>

      {message ? <span className="admin-store-action-message">{message}</span> : null}
    </div>
  )
}
