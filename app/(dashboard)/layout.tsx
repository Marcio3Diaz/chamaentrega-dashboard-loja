import '../private.css'
import { DashboardShell } from '@/components/dashboard-shell'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { store, stores, userId } = await requireStore()
  const supabase = await createClient()
  const { data: walletRows } = await supabase.rpc('get_my_store_wallet', { p_store_id: store.id })
  const wallet = walletRows?.[0]
  const walletBalance = Number(wallet?.balance ?? 0)
  const walletReserved = Number(wallet?.reserved_balance ?? 0)
  const walletAvailable = Number(wallet?.available_balance ?? Math.max(walletBalance - walletReserved, 0))

  return (
    <DashboardShell
      storeId={store.id}
      userId={userId}
      stores={stores}
      storeName={store.name}
      storeActive={store.is_active}
      moderationStatus={store.moderation_status}
      moderationReason={store.moderation_reason ?? null}
      storeLogoUrl={store.logo_url}
      walletAvailable={walletAvailable}
    >
      {children}
    </DashboardShell>
  )
}
