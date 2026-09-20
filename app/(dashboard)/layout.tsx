import { DashboardShell } from '@/components/dashboard-shell'
import { requireStore } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { store, userId } = await requireStore()

  return (
    <DashboardShell
      storeId={store.id}
      userId={userId}
      storeName={store.name}
      storeActive={store.is_active}
      storeLogoUrl={store.logo_url}
    >
      {children}
    </DashboardShell>
  )
}
