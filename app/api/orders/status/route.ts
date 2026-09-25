import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { shadowCancelledDeliveryToMySql } from '@/lib/migration-api'

const allowedStatuses = new Set([
  'new',
  'preparing',
  'ready',
  'seeking_courier',
  'in_route',
  'completed',
  'cancelled',
])

function redirectBack(
  request: Request,
  orderId: string,
  result: 'ok' | 'error',
  message: string,
) {
  const url = new URL('/pedidos', request.url)
  if (orderId) url.searchParams.set('pedido', orderId)
  url.searchParams.set('action', result)
  url.searchParams.set('message', message)
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const storeId = String(formData.get('storeId') ?? '').trim()
    const orderId = String(formData.get('orderId') ?? '').trim()
    const deliveryId = String(formData.get('deliveryId') ?? '').trim()
    const nextStatus = String(formData.get('status') ?? '').trim()
    const standalone = String(formData.get('standalone') ?? '') === '1'

    if (!storeId || !orderId || !allowedStatuses.has(nextStatus)) {
      return redirectBack(request, orderId, 'error', 'Ação inválida.')
    }

    const access = await requireStore()

    if (!access.stores.some(store => store.id === storeId)) {
      return redirectBack(request, orderId, 'error', 'Você não tem acesso a esta loja.')
    }

    const supabase = await createClient()

    if (standalone || orderId.startsWith('delivery:')) {
      if (!deliveryId || nextStatus !== 'cancelled') {
        return redirectBack(request, orderId, 'error', 'Ação não permitida para esta entrega.')
      }

      const { data: delivery, error: deliveryError } = await supabase
        .from('deliveries')
        .select('id,status')
        .eq('id', deliveryId)
        .eq('store_id', storeId)
        .maybeSingle()

      if (deliveryError || !delivery) {
        return redirectBack(request, orderId, 'error', 'Entrega não encontrada.')
      }

      if (delivery.status === 'completed') {
        return redirectBack(request, orderId, 'error', 'Uma entrega concluída não pode ser cancelada.')
      }

      if (!['cancelled','expired'].includes(delivery.status)) {
        const { error } = await supabase
          .from('deliveries')
          .update({ status: 'cancelled' })
          .eq('id', deliveryId)
          .eq('store_id', storeId)

        if (error) {
          return redirectBack(request, orderId, 'error', error.message || 'Não foi possível cancelar a entrega.')
        }
      }

      const shadowCancel = await shadowCancelledDeliveryToMySql(
        deliveryId,
        storeId,
        'cancelled_from_store_dashboard',
      )
      if (shadowCancel.attempted) {
        console.info('[orders/status] standalone delivery cancel shadow', {
          deliveryId,
          ok:shadowCancel.ok,
          error:shadowCancel.error ?? null,
        })
      }

      return redirectBack(request, orderId, 'ok', 'Entrega cancelada com sucesso.')
    }

    const { data: order, error: orderError } = await supabase
      .from('store_orders')
      .select('id,status,delivery_id')
      .eq('id', orderId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (orderError || !order) {
      return redirectBack(request, orderId, 'error', 'Pedido não encontrado.')
    }

    if (nextStatus === 'cancelled' && order.delivery_id) {
      const { data: linkedDelivery } = await supabase
        .from('deliveries')
        .select('id,status')
        .eq('id', order.delivery_id)
        .eq('store_id', storeId)
        .maybeSingle()

      if (linkedDelivery?.status === 'completed') {
        return redirectBack(request, orderId, 'error', 'A entrega deste pedido já foi concluída.')
      }

      if (linkedDelivery && !['cancelled','expired'].includes(linkedDelivery.status)) {
        const { error: deliveryCancelError } = await supabase
          .from('deliveries')
          .update({ status: 'cancelled' })
          .eq('id', order.delivery_id)
          .eq('store_id', storeId)

        if (deliveryCancelError) {
          return redirectBack(request, orderId, 'error', 'Não foi possível cancelar a entrega vinculada.')
        }
      }

      if (linkedDelivery) {
        const shadowCancel = await shadowCancelledDeliveryToMySql(
          order.delivery_id,
          storeId,
          'linked_order_cancelled_from_store_dashboard',
        )
        if (shadowCancel.attempted) {
          console.info('[orders/status] linked delivery cancel shadow', {
            deliveryId:order.delivery_id,
            ok:shadowCancel.ok,
            error:shadowCancel.error ?? null,
          })
        }
      }
    }

    const { error } = await supabase
      .from('store_orders')
      .update({ status: nextStatus })
      .eq('id', orderId)
      .eq('store_id', storeId)

    if (error) {
      return redirectBack(request, orderId, 'error', error.message || 'Não foi possível atualizar o pedido.')
    }

    const message =
      nextStatus === 'cancelled'
        ? 'Pedido cancelado com sucesso.'
        : nextStatus === 'preparing'
          ? 'Pedido marcado como em preparo.'
          : nextStatus === 'ready'
            ? 'Pedido marcado como pronto.'
            : nextStatus === 'completed'
              ? 'Pedido concluído com sucesso.'
              : 'Status do pedido atualizado.'

    return redirectBack(request, orderId, 'ok', message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha inesperada.'
    return redirectBack(request, '', 'error', message)
  }
}
