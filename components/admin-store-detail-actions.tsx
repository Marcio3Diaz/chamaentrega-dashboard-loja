'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icon'
import {
  selectStoreForAdminAction,
  setStoreActiveAdminAction,
} from '@/app/(admin)/admin/actions'

export function AdminStoreDetailActions({
  storeId,
  isActive,
}:{
  storeId:string
  isActive:boolean
}) {
  const router = useRouter()
  const [pending,startTransition] = useTransition()
  const [message,setMessage] = useState('')

  function openPortal() {
    setMessage('')
    startTransition(async () => {
      const result = await selectStoreForAdminAction(storeId)
      if (!result.ok) {
        setMessage(result.message)
        return
      }

      router.push('/painel')
      router.refresh()
    })
  }

  function toggleStore() {
    setMessage('')
    startTransition(async () => {
      const result = await setStoreActiveAdminAction(storeId,!isActive)
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="admin-store-detail-actions">
      <button
        type="button"
        className="admin-store-primary-action"
        onClick={openPortal}
        disabled={pending}
      >
        <Icon name="store" size={17}/>
        Abrir Portal da Loja
      </button>

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
