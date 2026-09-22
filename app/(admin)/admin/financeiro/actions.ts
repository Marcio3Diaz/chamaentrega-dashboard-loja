'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function numberValue(value:FormDataEntryValue|null) {
  const raw = String(value ?? '').trim().replace(',','.')
  if (!raw) return null

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function boundedNumber(
  value:FormDataEntryValue|null,
  min:number,
  maxInclusive:number,
) {
  const parsed = numberValue(value)
  if (parsed === null || parsed < min || parsed > maxInclusive) return null
  return parsed
}

function parseBillingDate(value:FormDataEntryValue|null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined

  const date = new Date(`${raw}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

export async function updatePlatformBillingSettingsAction(formData:FormData) {
  const { userId } = await requireAdmin()
  const supabase = await createClient()

  const commissionEnabled = formData.get('commission_enabled') === 'on'
  const subscriptionsEnabled = formData.get('subscriptions_enabled') === 'on'
  const deliveryCommissionPercent = boundedNumber(
    formData.get('delivery_commission_percent'),
    0,
    100,
  )
  const defaultSubscriptionAmount = boundedNumber(
    formData.get('default_subscription_amount'),
    0,
    9_999_999_999.99,
  )

  if (
    deliveryCommissionPercent === null
    || defaultSubscriptionAmount === null
  ) {
    throw new Error('Valores do modelo de cobrança inválidos.')
  }

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
  const planName = String(formData.get('plan_name') ?? '').trim().slice(0,120)
    || 'Plano ChamaEntrega'
  const monthlyAmount = boundedNumber(
    formData.get('monthly_amount'),
    0,
    9_999_999_999.99,
  )
  const status = String(formData.get('status') ?? 'inactive')
  const allowed = new Set(['inactive','trialing','active','paused','cancelled'])
  const nextBillingAt = parseBillingDate(formData.get('next_billing_at'))

  if (
    !UUID_RE.test(storeId)
    || !allowed.has(status)
    || monthlyAmount === null
    || nextBillingAt === undefined
  ) {
    throw new Error('Assinatura inválida.')
  }

  const { data:existing,error:existingError } = await supabase
    .from('store_subscriptions')
    .select('started_at')
    .eq('store_id',storeId)
    .maybeSingle()

  if (existingError) {
    throw new Error('Não foi possível carregar a assinatura da loja.')
  }

  const { error } = await supabase
    .from('store_subscriptions')
    .upsert({
      store_id:storeId,
      plan_name:planName,
      monthly_amount:monthlyAmount,
      status,
      started_at:existing?.started_at
        ?? (status === 'active' ? new Date().toISOString() : null),
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
  if (!UUID_RE.test(subscriptionId)) {
    throw new Error('Assinatura inválida.')
  }

  const { error } = await supabase.rpc('admin_register_subscription_payment',{
    p_subscription_id:subscriptionId,
  })

  if (error) {
    const messages:Record<string,string> = {
      ADMIN_MFA_REQUIRED:'Confirme o MFA administrativo para continuar.',
      SUBSCRIPTION_NOT_FOUND:'Assinatura não encontrada.',
      SUBSCRIPTION_AMOUNT_REQUIRED:'Defina um valor mensal antes de registrar o pagamento.',
    }

    throw new Error(
      messages[error.message]
      ?? 'Não foi possível registrar o pagamento da assinatura.',
    )
  }

  revalidatePath('/admin/financeiro')
}
