import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error:'unauthorized' },{ status:401 })
  }

  let body:{ storeId?:string } = {}
  try { body = await request.json() } catch {}

  const storeId = String(body.storeId ?? '').trim()
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

  const { error } = await supabase.rpc('disconnect_whatsapp_embedded_signup',{
    p_store_id:storeId,
  })

  if (error) {
    return NextResponse.json({ error:'disconnect_failed' },{ status:500 })
  }

  return NextResponse.json({ disconnected:true })
}
