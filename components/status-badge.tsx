import { statusLabel } from '@/lib/format'
export function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status}`}>{statusLabel[status] ?? status}</span>
}
