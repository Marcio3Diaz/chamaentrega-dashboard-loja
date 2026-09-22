import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acceptsJson, isTrustedBrowserOrigin, readJsonWithinLimit } from '@/lib/security/origin'

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) {
    return NextResponse.json({ error:'origin_not_allowed' },{ status:403 })
  }

  if (!acceptsJson(request)) {
    return NextResponse.json({ error:'json_required' },{ status:415 })
  }

  const parsed = await readJsonWithinLimit<{ storeId?: string }>(request, 4 * 1024)

  if (!parsed.ok) {
    return NextResponse.json(
      { error:parsed.error },
      { status:parsed.error === 'payload_too_large' ? 413 : 400 },
    )
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error:'unauthorized' },{ status:401 })
  }

  const storeId = String(parsed.data.storeId ?? '').trim()

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)
  ) {
    return NextResponse.json({ error:'invalid_store_id' },{ status:400 })
  }

  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('id',storeId)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error:'store_not_allowed' },{ status:403 })
  }

  const { error } = await supabase.rpc('disconnect_whatsapp_embedded_signup',{
    p_store_id:storeId,
  })

  if (error) {
    return NextResponse.json({ error:'disconnect_failed' },{ status:500 })
  }

  return NextResponse.json({ disconnected:true })
}
