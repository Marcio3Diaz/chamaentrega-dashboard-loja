import '../private.css'
import { DashboardShell } from '@/components/dashboard-shell'
import { requireStore } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { store, stores, userId } = await requireStore()

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
    >
      {children}
    </DashboardShell>
  )
}
