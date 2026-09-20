'use client'

import { ChangeEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'

type Props = {
  storeId: string
  userId: string
  storeName: string
  logoUrl: string | null
  variant?: 'sidebar' | 'topbar'
}

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const extensionByType: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function StoreLogoUpload({
  storeId,
  userId,
  storeName,
  logoUrl,
  variant = 'sidebar',
}: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(logoUrl)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!allowedTypes.has(file.type)) {
      setMessage('Use uma imagem PNG, JPG ou WebP.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage('A imagem deve ter no máximo 5 MB.')
      return
    }

    setUploading(true)
    setMessage('')

    const supabase = createClient()
    const extension = extensionByType[file.type]
    const path = `${userId}/logo-${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('store-logos')
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      setUploading(false)
      setMessage('Não foi possível enviar a logo.')
      return
    }

    const { data: publicData } = supabase.storage.from('store-logos').getPublicUrl(path)
    const publicUrl = publicData.publicUrl

    const { error: updateError } = await supabase
      .from('stores')
      .update({ logo_url: publicUrl })
      .eq('id', storeId)
      .eq('owner_id', userId)

    if (updateError) {
      await supabase.storage.from('store-logos').remove([path])
      setUploading(false)
      setMessage('A imagem foi enviada, mas não foi possível atualizar a loja.')
      return
    }

    setPreview(publicUrl)
    setUploading(false)
    setMessage('Logo atualizada.')
    router.refresh()
  }

  return (
    <div className={`store-logo-upload variant-${variant} ${uploading ? 'is-uploading' : ''}`}>
      <button
        type="button"
        className="store-logo-button"
        onClick={() => inputRef.current?.click()}
        aria-label={`Trocar logo de ${storeName}`}
        title="Clique para trocar a logo"
        disabled={uploading}
      >
        {preview ? (
          <img src={preview} alt={`Logo de ${storeName}`} />
        ) : (
          <span className="store-logo-fallback"><Icon name="store" size={variant === 'sidebar' ? 20 : 17}/></span>
        )}
        <span className="store-logo-edit" aria-hidden="true">+</span>
        {uploading ? <span className="store-logo-loading" aria-hidden="true" /> : null}
      </button>

      <input
        ref={inputRef}
        className="store-logo-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
      />

      <span className="sr-only" aria-live="polite">{message}</span>
    </div>
  )
}
