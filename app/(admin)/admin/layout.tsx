import { requireAdmin } from '@/lib/auth'
import { AdminShell } from '@/components/admin-shell'

export default async function AdminLayout({
  children,
}:{
  children:React.ReactNode
}) {
  const { fullName } = await requireAdmin()

  return (
    <AdminShell fullName={fullName}>
      {children}
    </AdminShell>
  )
}
