import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acceptsJson, bodyWithinLimit, isTrustedBrowserOrigin } from '@/lib/security/origin'

export const dynamic = 'force-dynamic'

type GeocodeRequest = {
  address?: string
}

export async function POST(request: Request) {
  try {
    if (!isTrustedBrowserOrigin(request)) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 })
    }

    if (!acceptsJson(request)) {
      return NextResponse.json({ error: 'Envie os dados em JSON.' }, { status: 415 })
    }

    if (!bodyWithinLimit(request, 8 * 1024)) {
      return NextResponse.json({ error: 'Requisição muito grande.' }, { status: 413 })
    }

    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (!claimsData?.claims?.sub) {
      return NextResponse.json(
        { error: 'Sessão necessária para localizar endereços.' },
        { status: 401 },
      )
    }

    const body = await request.json() as GeocodeRequest
    const address = String(body.address ?? '').trim()

    if (address.length < 6) {
      return NextResponse.json(
        { error: 'Informe um endereço mais completo.' },
        { status: 400 },
      )
    }

    if (address.length > 350) {
      return NextResponse.json(
        { error: 'Endereço muito longo.' },
        { status: 400 },
      )
    }

    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'br')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('q', address)

    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent': 'ChamaEntrega/1.0',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'O serviço de localização não respondeu.' },
        { status: 502 },
      )
    }

    const results = await response.json() as Array<{
      lat?: string
      lon?: string
      display_name?: string
    }>

    const first = results[0]
    const latitude = Number(first?.lat)
    const longitude = Number(first?.lon)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: 'Endereço não localizado. Inclua número, bairro e cidade.' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      latitude,
      longitude,
      displayName: String(first?.display_name ?? address),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'

    return NextResponse.json(
      {
        error: timedOut
          ? 'O serviço de localização demorou para responder. Tente novamente.'
          : 'Não foi possível localizar o endereço.',
      },
      { status: timedOut ? 504 : 500 },
    )
  }
}
