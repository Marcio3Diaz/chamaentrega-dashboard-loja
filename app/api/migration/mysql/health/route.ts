import { NextResponse } from 'next/server'
import { checkMigrationApiHealth } from '@/lib/migration-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await checkMigrationApiHealth()
  return NextResponse.json(health, {
    status: health.configured && !health.ok ? 503 : 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
