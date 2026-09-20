import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StoreIntegrationsPanel, type StoreIntegrationRow } from '@/components/store-integrations-panel'

export default async function IntegrationsPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('store_integrations')
    .select('id,store_id,provider,status,is_enabled,public_config,last_synced_at,last_error,updated_at')
    .eq('store_id', store.id)
    .order('provider')

  const integrations: StoreIntegrationRow[] = (rows ?? []).map((row: any) => ({
    id: row.id,
    storeId: row.store_id,
    provider: row.provider,
    status: row.status,
    isEnabled: Boolean(row.is_enabled),
    publicConfig: row.public_config ?? {},
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  }))

  return (
    <StoreIntegrationsPanel
      storeId={store.id}
      storeName={store.name}
      initialRows={integrations}
    />
  )
}
