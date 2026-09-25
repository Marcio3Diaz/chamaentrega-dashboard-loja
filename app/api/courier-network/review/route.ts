import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { shadowCourierNetworkReviewToMySql } from '@/lib/migration-api'

function redirectBack(request: Request, params: Record<string,string>) {
  const url = new URL('/entregadores', request.url)
  for (const [key,value] of Object.entries(params)) {
    url.searchParams.set(key,value)
  }
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const storeId = String(formData.get('storeId') ?? '').trim()
    const courierId = String(formData.get('courierId') ?? '').trim()
    const decision = String(formData.get('decision') ?? '').trim()

    if (!storeId || !courierId || !['connected','rejected'].includes(decision)) {
      return redirectBack(request, {
        review: 'error',
        message: 'Solicitação inválida.',
      })
    }

    const access = await requireStore()

    if (!access.stores.some(store => store.id === storeId)) {
      return redirectBack(request, {
        review: 'error',
        message: 'Você não tem acesso a esta loja.',
      })
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc('review_courier_store_network_request', {
      p_store_id: storeId,
      p_courier_id: courierId,
      p_decision: decision,
      p_note: null,
    })

    if (error) {
      const raw = error.message ?? ''

      if (raw.includes('REQUEST_ALREADY_REVIEWED')) {
        return redirectBack(request, {
          review: 'error',
          message: 'Esta solicitação já foi analisada.',
        })
      }

      if (raw.includes('REQUEST_NOT_FOUND')) {
        return redirectBack(request, {
          review: 'error',
          message: 'Solicitação não encontrada.',
        })
      }

      if (raw.includes('STORE_ACCESS_REQUIRED')) {
        return redirectBack(request, {
          review: 'error',
          message: 'A sessão atual não tem permissão para analisar esta solicitação.',
        })
      }

      return redirectBack(request, {
        review: 'error',
        message: raw || 'Não foi possível analisar a solicitação agora.',
      })
    }

    const shadow = await shadowCourierNetworkReviewToMySql(
      storeId,
      courierId,
      access.userId,
      decision as 'connected' | 'rejected',
      null,
    )

    if (shadow.attempted && !shadow.ok) {
      console.error('[mysql-shadow] courier network review diverged', {
        storeId,
        courierId,
        decision,
        error:shadow.error ?? 'unknown_shadow_error',
      })
    }

    return redirectBack(request, {
      review: decision === 'connected' ? 'approved' : 'rejected',
      message: decision === 'connected'
        ? 'Entregador aprovado e adicionado à rede da loja.'
        : 'Solicitação recusada.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha inesperada.'
    return redirectBack(request, {
      review: 'error',
      message,
    })
  }
}
