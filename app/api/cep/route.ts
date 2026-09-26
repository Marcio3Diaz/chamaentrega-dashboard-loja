import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isTrustedBrowserOrigin } from '@/lib/security/origin'

export const dynamic = 'force-dynamic'

type ViaCepResponse = {
  cep?: string
  logradouro?: string
  complemento?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean
}

type BrasilApiCepV2Response = {
  cep?: string
  state?: string
  city?: string
  neighborhood?: string
  street?: string
  location?: {
    type?: string
    coordinates?: {
      longitude?: string | number | null
      latitude?: string | number | null
    } | null
  } | null
}

export async function GET(request: Request) {
  try {
    if (!isTrustedBrowserOrigin(request)) {
      return NextResponse.json({ error:'Origem não autorizada.' },{ status:403 })
    }

    const supabase = await createClient()
    const { data:claimsData } = await supabase.auth.getClaims()

    if (!claimsData?.claims?.sub) {
      return NextResponse.json(
        { error:'Sessão necessária para consultar CEP.' },
        { status:401 },
      )
    }

    const url = new URL(request.url)
    const cep = String(url.searchParams.get('cep') ?? '').replace(/\D/g,'').slice(0,8)

    if (cep.length !== 8) {
      return NextResponse.json(
        { error:'Informe um CEP com 8 dígitos.' },
        { status:400 },
      )
    }

    let brasilApiData: BrasilApiCepV2Response | null = null

    try {
      const brasilResponse = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`,{
        cache:'no-store',
        signal:AbortSignal.timeout(6000),
        headers:{
          Accept:'application/json',
          'User-Agent':'ChamaEntrega/1.0',
        },
      })

      if (brasilResponse.ok) {
        brasilApiData = await brasilResponse.json() as BrasilApiCepV2Response
      }
    } catch {
      // ViaCEP abaixo continua como fallback cadastral.
    }

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`,{
      cache:'no-store',
      signal:AbortSignal.timeout(6000),
      headers:{
        Accept:'application/json',
        'User-Agent':'ChamaEntrega/1.0',
      },
    })

    if (!response.ok && !brasilApiData) {
      return NextResponse.json(
        { error:'Os serviços de CEP não responderam.' },
        { status:502 },
      )
    }

    const payload = response.ok
      ? await response.json() as ViaCepResponse
      : null

    if (payload?.erro && !brasilApiData) {
      return NextResponse.json(
        { error:'CEP não encontrado.' },
        { status:404 },
      )
    }

    const rawLatitude = brasilApiData?.location?.coordinates?.latitude
    const rawLongitude = brasilApiData?.location?.coordinates?.longitude
    const latitude = rawLatitude == null ? null : Number(rawLatitude)
    const longitude = rawLongitude == null ? null : Number(rawLongitude)
    const hasCoordinates =
      latitude !== null
      && longitude !== null
      && Number.isFinite(latitude)
      && Number.isFinite(longitude)

    return NextResponse.json({
      cep:payload?.cep ?? brasilApiData?.cep ?? cep,
      street:String(payload?.logradouro ?? brasilApiData?.street ?? ''),
      complement:String(payload?.complemento ?? ''),
      neighborhood:String(payload?.bairro ?? brasilApiData?.neighborhood ?? ''),
      city:String(payload?.localidade ?? brasilApiData?.city ?? ''),
      state:String(payload?.uf ?? brasilApiData?.state ?? ''),
      latitude:hasCoordinates ? latitude : null,
      longitude:hasCoordinates ? longitude : null,
      coordinateSource:hasCoordinates ? 'cep' : null,
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'

    return NextResponse.json(
      {
        error:timedOut
          ? 'A consulta do CEP demorou para responder. Tente novamente.'
          : 'Não foi possível consultar o CEP agora.',
      },
      { status:timedOut ? 504 : 500 },
    )
  }
}
