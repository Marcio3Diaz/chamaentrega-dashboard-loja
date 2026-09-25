import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/auth'
import {
  createMigrationApiSession,
  isMigrationApiConfigured,
  migrationRealtimeUrl,
} from '@/lib/migration-api'

export const dynamic = 'force-dynamic'

export async function POST() {
  if (!isMigrationApiConfigured()) {
    return NextResponse.json(
      { error:'migration_api_not_configured' },
      { status:503, headers:{ 'Cache-Control':'no-store' } },
    )
  }

  const { store, userId, role } = await requireStore()
  const subjectRole = role === 'admin' ? 'admin' : role === 'store_owner' ? 'store_owner' : 'store_member'

  try {
    const session = await createMigrationApiSession({
      subjectId:userId,
      subjectRole,
      scopes:[
        'store:read',
        'delivery:read',
        'delivery:write',
        'courier-network:review',
        'realtime:connect',
      ],
    })

    return NextResponse.json(
      {
        ...session,
        realtimeUrl:migrationRealtimeUrl(),
        defaultChannel:`store:${store.id}`,
      },
      { headers:{ 'Cache-Control':'no-store' } },
    )
  } catch (error) {
    const status = Number((error as Error & { status?:number }).status || 502)
    return NextResponse.json(
      { error:error instanceof Error ? error.message : 'migration_session_failed' },
      { status, headers:{ 'Cache-Control':'no-store' } },
    )
  }
}
