import '../../private.css'
import { requireAdmin } from '@/lib/auth'
import { AdminShell } from '@/components/admin-shell'

export const dynamic = 'force-dynamic'

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
