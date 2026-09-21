import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StoreSettingsPanel, type StoreSettingsData } from '@/components/store-settings-panel'

export default async function SettingsPage() {
  const { store, userId } = await requireStore()
  const supabase = await createClient()

  const [
    { data: fullStore },
    { data: profile },
    { data: userData },
    { data: walletRows },
    { data: pricingRow },
  ] = await Promise.all([
    supabase
      .from('stores')
      .select('id,owner_id,name,phone,logo_url,address,latitude,longitude,is_active,zip_code,street,street_number,complement,neighborhood,city,state,created_at,updated_at')
      .eq('id', store.id)
      .eq('owner_id', userId)
      .single(),
    supabase
      .from('profiles')
      .select('id,full_name,phone,role,avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    supabase.auth.getUser(),
    supabase.rpc('get_my_store_wallet', { p_store_id: store.id }),
    supabase
      .from('delivery_pricing_settings')
      .select('enabled,minimum_fee,included_km,per_extra_km,road_factor,round_step')
      .eq('store_id',store.id)
      .maybeSingle(),
  ])

  const wallet = walletRows?.[0] ?? {
    balance: 0,
    reserved_balance: 0,
    available_balance: 0,
  }

  const data: StoreSettingsData = {
    storeId: store.id,
    userId,
    name: fullStore?.name ?? store.name,
    phone: fullStore?.phone ?? store.phone,
    logoUrl: fullStore?.logo_url ?? store.logo_url,
    address: fullStore?.address ?? store.address,
    latitude: fullStore?.latitude == null ? null : Number(fullStore.latitude),
    longitude: fullStore?.longitude == null ? null : Number(fullStore.longitude),
    isActive: Boolean(fullStore?.is_active ?? store.is_active),
    zipCode: fullStore?.zip_code ?? '',
    street: fullStore?.street ?? '',
    streetNumber: fullStore?.street_number ?? '',
    complement: fullStore?.complement ?? '',
    neighborhood: fullStore?.neighborhood ?? '',
    city: fullStore?.city ?? store.city ?? '',
    state: fullStore?.state ?? store.state ?? '',
    adminName: profile?.full_name ?? '',
    adminPhone: profile?.phone ?? '',
    adminEmail: userData.user?.email ?? '',
    adminRole: profile?.role ?? 'store_owner',
    walletBalance: Number(wallet.balance ?? 0),
    walletReserved: Number(wallet.reserved_balance ?? 0),
    walletAvailable: Number(wallet.available_balance ?? 0),
    pricingEnabled: Boolean(pricingRow?.enabled ?? true),
    pricingMinimumFee: Number(pricingRow?.minimum_fee ?? 7.5),
    pricingIncludedKm: Number(pricingRow?.included_km ?? 2),
    pricingPerExtraKm: Number(pricingRow?.per_extra_km ?? 1.5),
    pricingRoadFactor: Number(pricingRow?.road_factor ?? 1.25),
    pricingRoundStep: Number(pricingRow?.round_step ?? .5),
  }

  return <StoreSettingsPanel initialData={data} />
}
