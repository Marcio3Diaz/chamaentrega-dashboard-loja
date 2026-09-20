import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error:'unauthorized' },{ status:401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')?.trim()

  if (!storeId) {
    return NextResponse.json({ error:'store_required' },{ status:400 })
  }

  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('id',storeId)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error:'store_not_allowed' },{ status:403 })
  }

  const appId = process.env.META_WHATSAPP_APP_ID?.trim() ?? ''
  const configId = process.env.META_WHATSAPP_CONFIG_ID?.trim() ?? ''
  const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim() ?? ''
  const graphApiVersion = process.env.META_GRAPH_API_VERSION?.trim() || 'v26.0'
  const featureType = process.env.META_WHATSAPP_FEATURE_TYPE?.trim() || null

  const ready = Boolean(appId && configId && appSecret)

  return NextResponse.json({
    ready,
    appId: ready ? appId : null,
    configId: ready ? configId : null,
    graphApiVersion,
    featureType: ready ? featureType : null,
  }, {
    headers:{ 'cache-control':'no-store' },
  })
}
