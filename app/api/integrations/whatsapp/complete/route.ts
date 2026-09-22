import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SignupBody = {
  storeId?: string
  code?: string
  wabaId?: string
  phoneNumberId?: string
}

function numericId(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d{5,40}$/.test(text) ? text : ''
}

async function graphJson(url: string, init: RequestInit) {
  const response = await fetch(url,{
    ...init,
    cache:'no-store',
    signal:init.signal ?? AbortSignal.timeout(10000),
  })
  const data = await response.json().catch(() => ({})) as Record<string,unknown>

  if (!response.ok) {
    const graphError = (data.error ?? {}) as Record<string,unknown>
    throw new Error(String(graphError.message ?? `Meta HTTP ${response.status}`))
  }

  return data
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error:'unauthorized' },{ status:401 })
  }

  let body: SignupBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error:'invalid_json' },{ status:400 })
  }

  const storeId = String(body.storeId ?? '').trim()
  const code = String(body.code ?? '').trim()
  const wabaId = numericId(body.wabaId)
  const phoneNumberId = numericId(body.phoneNumberId)

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)
    || code.length < 8
    || code.length > 4096
    || !wabaId
    || !phoneNumberId
  ) {
    return NextResponse.json(
      { error:'invalid_signup_payload' },
      { status:400,headers:{ 'cache-control':'no-store' } },
    )
  }

  const { data: store } = await supabase
    .from('stores')
    .select('id,name')
    .eq('id',storeId)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error:'store_not_allowed' },{ status:403 })
  }

  const appId = process.env.META_WHATSAPP_APP_ID?.trim() ?? ''
  const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim() ?? ''
  const version = process.env.META_GRAPH_API_VERSION?.trim() || 'v26.0'
  const redirectUri = process.env.META_WHATSAPP_REDIRECT_URI?.trim() ?? ''

  if (!appId || !appSecret) {
    return NextResponse.json({ error:'platform_not_configured' },{ status:503 })
  }

  try {
    const tokenParams = new URLSearchParams({
      client_id:appId,
      client_secret:appSecret,
      code,
    })

    if (redirectUri) tokenParams.set('redirect_uri',redirectUri)

    const tokenData = await graphJson(
      `https://graph.facebook.com/${version}/oauth/access_token`,
      {
        method:'POST',
        headers:{ 'content-type':'application/x-www-form-urlencoded' },
        body:tokenParams,
      },
    )

    const accessToken = String(tokenData.access_token ?? '')
    if (!accessToken) throw new Error('A Meta não retornou o token da conexão.')

    const numbersData = await graphJson(
      `https://graph.facebook.com/${version}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
      { headers:{ Authorization:`Bearer ${accessToken}` } },
    )

    const numbers = Array.isArray(numbersData.data)
      ? numbersData.data as Array<Record<string,unknown>>
      : []

    const phone = numbers.find(item => String(item.id ?? '') === phoneNumberId)

    if (!phone) {
      throw new Error('O número selecionado não pertence à conta WhatsApp autorizada.')
    }

    await graphJson(
      `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
      {
        method:'POST',
        headers:{ Authorization:`Bearer ${accessToken}` },
      },
    )

    const expiresIn = Number(tokenData.expires_in)
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    const { error: rpcError } = await supabase.rpc('complete_whatsapp_embedded_signup',{
      p_store_id:storeId,
      p_waba_id:wabaId,
      p_phone_number_id:phoneNumberId,
      p_display_phone_number:String(phone.display_phone_number ?? ''),
      p_verified_name:String(phone.verified_name ?? ''),
      p_access_token:accessToken,
      p_token_type:String(tokenData.token_type ?? ''),
      p_token_expires_at:expiresAt,
    })

    if (rpcError) {
      throw new Error(`Falha ao salvar conexão: ${rpcError.message}`)
    }

    return NextResponse.json({
      connected:true,
      displayPhoneNumber:String(phone.display_phone_number ?? ''),
      verifiedName:String(phone.verified_name ?? ''),
    },{
      headers:{ 'cache-control':'no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('WhatsApp direct signup:',message)

    return NextResponse.json({
      error:'meta_connection_failed',
      message:'Não foi possível concluir a conexão com o WhatsApp. Tente novamente.',
    },{
      status:502,
      headers:{ 'cache-control':'no-store' },
    })
  }
}
