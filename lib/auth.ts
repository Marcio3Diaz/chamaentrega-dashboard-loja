import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Store } from '@/lib/types'

export type StoreOption = Pick<
  Store,
  'id' | 'name' | 'logo_url' | 'is_active' | 'moderation_status' | 'city' | 'state'
>

const ACTIVE_STORE_COOKIE = 'chamaentrega-store-id'

export async function requireStore(): Promise<{
  store: Store
  stores: StoreOption[]
  userId: string
  role: string
}> {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (claimsError || !userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login?error=acesso')
  }

  const { data: ownedStores, error: ownedError } = await supabase
    .from('stores')
    .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,moderation_status,moderation_reason,city,state,created_at')
    .eq('owner_id', userId)

  if (ownedError) redirect('/login?error=loja')

  /*
   * Quem é proprietário já tem acesso garantido às próprias lojas.
   * Evitamos consultar store_members nesse caso porque uma falha de RLS
   * na tabela de vínculos não deve derrubar o acesso do dono da loja.
   */
  let memberships: { store_id: string }[] = []

  if (!(ownedStores?.length)) {
    const { data, error } = await supabase
      .from('store_members')
      .select('store_id')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error) redirect('/login?error=loja')

    memberships = data ?? []
  }

  const ownedIds = new Set((ownedStores ?? []).map(store => store.id))
  const memberIds = memberships
    .map(member => member.store_id)
    .filter(storeId => !ownedIds.has(storeId))

  const { data: memberStores, error: memberStoreError } = memberIds.length
    ? await supabase
        .from('stores')
        .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,moderation_status,moderation_reason,city,state,created_at')
        .in('id', memberIds)
    : { data: [], error: null }

  if (memberStoreError) redirect('/login?error=loja')

  const stores = [...(ownedStores ?? []), ...(memberStores ?? [])]
    .sort((a,b) => {
      if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

  if (!stores.length) {
    if (profile.role === 'store_owner') redirect('/onboarding')
    redirect('/login?error=acesso')
  }

  const cookieStore = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value
  const selected =
    stores.find(item => item.id === cookieStore) ??
    stores[0]

  return {
    store: selected as Store,
    stores: stores.map(item => ({
      id: item.id,
      name: item.name,
      logo_url: item.logo_url,
      is_active: item.is_active,
      moderation_status: item.moderation_status,
      city: item.city,
      state: item.state,
    })) as StoreOption[],
    userId,
    role: profile.role,
  }
}

export { ACTIVE_STORE_COOKIE }

export async function requireAdminIdentity(): Promise<{
  userId:string
  fullName:string
}> {
  const supabase = await createClient()
  const { data:claimsData,error:claimsError } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (claimsError || !userId) redirect('/admin/login')

  const { data:profile } = await supabase
    .from('profiles')
    .select('full_name,role')
    .eq('id',userId)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') {
    await supabase.auth.signOut()
    redirect('/admin/login?error=acesso')
  }

  return {
    userId,
    fullName:profile.full_name?.trim() || 'Administrador',
  }
}

export async function requireAdmin(): Promise<{
  userId:string
  fullName:string
}> {
  const identity = await requireAdminIdentity()
  const supabase = await createClient()

  const { data:assurance,error:assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (assuranceError) {
    redirect('/admin/login?error=mfa')
  }

  if (assurance?.currentLevel !== 'aal2') {
    const { data:factors,error:factorsError } = await supabase.auth.mfa.listFactors()

    if (factorsError) {
      redirect('/admin/login?error=mfa')
    }

    const verifiedTotp = factors?.totp?.some(
      factor => factor.status === 'verified',
    )

    redirect(verifiedTotp ? '/admin/mfa' : '/admin/mfa/setup')
  }

  return identity
}
