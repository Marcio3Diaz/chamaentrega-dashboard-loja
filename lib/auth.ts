import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Store } from '@/lib/types'

export async function requireStore(): Promise<{ store: Store; userId: string }> {
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

  const { data: stores, error: storeError } = await supabase
    .from('stores')
    .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,city,state')
    .eq('owner_id', userId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })

  if (storeError || !stores?.length) redirect('/login?error=loja')

  return { store: stores[0] as Store, userId }
}
