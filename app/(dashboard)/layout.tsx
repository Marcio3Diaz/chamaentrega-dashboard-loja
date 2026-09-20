import { DashboardShell } from '@/components/dashboard-shell'
import { requireStore } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { store } = await requireStore()
  return <DashboardShell storeName={store.name} storeActive={store.is_active}>{children}</DashboardShell>
}
