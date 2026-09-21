'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function numberValue(value:FormDataEntryValue|null) {
  const parsed = Number(String(value ?? '').replace(',','.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export async function updatePlatformBillingSettingsAction(formData:FormData) {
  const { userId } = await requireAdmin()
  const supabase = await createClient()

  const commissionEnabled = formData.get('commission_enabled') === 'on'
  const subscriptionsEnabled = formData.get('subscriptions_enabled') === 'on'
  const deliveryCommissionPercent = Math.min(
    100,
    Math.max(0,numberValue(formData.get('delivery_commission_percent'))),
  )
  const defaultSubscriptionAmount = Math.max(
    0,
    numberValue(formData.get('default_subscription_amount')),
  )

  const { error } = await supabase
    .from('platform_billing_settings')
    .upsert({
      id:1,
      commission_enabled:commissionEnabled,
      delivery_commission_percent:deliveryCommissionPercent,
      subscriptions_enabled:subscriptionsEnabled,
      default_subscription_amount:defaultSubscriptionAmount,
      updated_at:new Date().toISOString(),
      updated_by:userId,
    })

  if (error) throw new Error('Não foi possível salvar o modelo de cobrança.')

  revalidatePath('/admin/financeiro')
}

export async function updateStoreSubscriptionAction(formData:FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const storeId = String(formData.get('store_id') ?? '').trim()
  const planName = String(formData.get('plan_name') ?? '').trim() || 'Plano ChamaEntrega'
  const monthlyAmount = Math.max(0,numberValue(formData.get('monthly_amount')))
  const status = String(formData.get('status') ?? 'inactive')
  const allowed = new Set(['inactive','trialing','active','paused','cancelled'])

  if (!storeId || !allowed.has(status)) {
    throw new Error('Assinatura inválida.')
  }

  const nextBillingRaw = String(formData.get('next_billing_at') ?? '').trim()
  const nextBillingAt = nextBillingRaw
    ? new Date(nextBillingRaw+'T12:00:00').toISOString()
    : null

  const { data:existing } = await supabase
    .from('store_subscriptions')
    .select('started_at')
    .eq('store_id',storeId)
    .maybeSingle()

  const { error } = await supabase
    .from('store_subscriptions')
    .upsert({
      store_id:storeId,
      plan_name:planName,
      monthly_amount:monthlyAmount,
      status,
      started_at:existing?.started_at ?? (status === 'active' ? new Date().toISOString() : null),
      next_billing_at:nextBillingAt,
      updated_at:new Date().toISOString(),
    },{
      onConflict:'store_id',
    })

  if (error) throw new Error('Não foi possível atualizar a assinatura da loja.')

  revalidatePath('/admin/financeiro')
}

export async function registerSubscriptionPaymentAction(formData:FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const subscriptionId = String(formData.get('subscription_id') ?? '').trim()
  if (!subscriptionId) throw new Error('Assinatura inválida.')

  const { data:subscription,error:subscriptionError } = await supabase
    .from('store_subscriptions')
    .select('id,store_id,plan_name,monthly_amount,status,next_billing_at')
    .eq('id',subscriptionId)
    .maybeSingle()

  if (subscriptionError || !subscription) {
    throw new Error('Assinatura não encontrada.')
  }

  const amount = Number(subscription.monthly_amount ?? 0)
  if (amount <= 0) {
    throw new Error('Defina um valor mensal antes de registrar o pagamento.')
  }

  const now = new Date()
  const next = subscription.next_billing_at
    ? new Date(subscription.next_billing_at)
    : new Date(now)
  next.setMonth(next.getMonth()+1)

  const { error:eventError } = await supabase
    .from('platform_revenue_events')
    .insert({
      store_id:subscription.store_id,
      subscription_id:subscription.id,
      revenue_type:'subscription',
      gross_reference_amount:amount,
      rate_percent:null,
      amount,
      status:'paid',
      description:`Assinatura — ${subscription.plan_name}`,
      occurred_at:now.toISOString(),
    })

  if (eventError) throw new Error('Não foi possível registrar a receita da assinatura.')

  const { error:updateError } = await supabase
    .from('store_subscriptions')
    .update({
      last_billed_at:now.toISOString(),
      next_billing_at:next.toISOString(),
      status:subscription.status === 'inactive' ? 'active' : subscription.status,
      updated_at:now.toISOString(),
    })
    .eq('id',subscription.id)

  if (updateError) throw new Error('Pagamento registrado, mas a assinatura não foi atualizada.')

  revalidatePath('/admin/financeiro')
}
