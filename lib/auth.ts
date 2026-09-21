import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Store } from '@/lib/types'

export type StoreOption = Pick<
  Store,
  'id' | 'name' | 'logo_url' | 'is_active' | 'city' | 'state'
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

  if (!profile || !['store_owner', 'admin'].includes(profile.role)) {
    await supabase.auth.signOut()
    redirect('/login?error=acesso')
  }

  let storesQuery = supabase
    .from('stores')
    .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,city,state')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })

  // Donos enxergam somente as próprias lojas. A conta admin poderá usar
  // o mesmo seletor para acessar qualquer operação cadastrada.
  if (profile.role !== 'admin') {
    storesQuery = storesQuery.eq('owner_id', userId)
  }

  const { data: stores, error: storeError } = await storesQuery

  if (storeError || !stores?.length) redirect('/login?error=loja')

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
      city: item.city,
      state: item.state,
    })) as StoreOption[],
    userId,
    role: profile.role,
  }
}

export { ACTIVE_STORE_COOKIE }
