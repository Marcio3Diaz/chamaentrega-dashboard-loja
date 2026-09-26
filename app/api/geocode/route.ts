import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acceptsJson, isTrustedBrowserOrigin, readJsonWithinLimit } from '@/lib/security/origin'

export const dynamic = 'force-dynamic'

type GeocodeRequest = {
  address?: string
  street?: string
  number?: string
  neighborhood?: string
  city?: string
  state?: string
  cep?: string
}

export async function POST(request: Request) {
  try {
    if (!isTrustedBrowserOrigin(request)) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 })
    }

    if (!acceptsJson(request)) {
      return NextResponse.json({ error: 'Envie os dados em JSON.' }, { status: 415 })
    }

    const parsed = await readJsonWithinLimit<GeocodeRequest>(request, 8 * 1024)

    if (!parsed.ok) {
      return NextResponse.json(
        {
          error: parsed.error === 'payload_too_large'
            ? 'Requisição muito grande.'
            : 'JSON inválido.',
        },
        { status: parsed.error === 'payload_too_large' ? 413 : 400 },
      )
    }

    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()

    if (!claimsData?.claims?.sub) {
      return NextResponse.json(
        { error: 'Sessão necessária para localizar endereços.' },
        { status: 401 },
      )
    }

    const address = String(parsed.data.address ?? '').trim()
    const street = String(parsed.data.street ?? '').trim()
    const number = String(parsed.data.number ?? '').trim()
    const neighborhood = String(parsed.data.neighborhood ?? '').trim()
    const city = String(parsed.data.city ?? '').trim()
    const state = String(parsed.data.state ?? '').trim()
    const cep = String(parsed.data.cep ?? '').replace(/\D/g,'').slice(0,8)

    if (address.length < 6 && street.length < 3) {
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

    const queries = [
      address,
      [street,number,neighborhood,city,state,cep ? `CEP ${cep}` : '', 'Brasil'].filter(Boolean).join(', '),
      [street,number,city,state,cep ? `CEP ${cep}` : '', 'Brasil'].filter(Boolean).join(', '),
      [street,city,state,'Brasil'].filter(Boolean).join(', '),
      cep ? [cep,'Brasil'].join(', ') : '',
    ].filter((value,index,array) => value && array.indexOf(value) === index)

    let matched: { lat?: string; lon?: string; display_name?: string } | null = null
    let lastServiceError = false

    for (const query of queries) {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format','jsonv2')
      url.searchParams.set('limit','5')
      url.searchParams.set('countrycodes','br')
      url.searchParams.set('addressdetails','1')
      url.searchParams.set('q',query)

      const response = await fetch(url,{
        cache:'no-store',
        signal:AbortSignal.timeout(7000),
        headers:{
          Accept:'application/json',
          'Accept-Language':'pt-BR,pt;q=0.9',
          'User-Agent':'ChamaEntrega/1.0',
        },
      })

      if (!response.ok) {
        lastServiceError = true
        continue
      }

      const results = await response.json() as Array<{
        lat?: string
        lon?: string
        display_name?: string
      }>

      const candidate = results.find(item =>
        Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
      )

      if (candidate) {
        matched = candidate
        break
      }
    }

    if (!matched) {
      return NextResponse.json(
        {
          error:lastServiceError
            ? 'O serviço de localização não respondeu corretamente. Tente novamente.'
            : 'Endereço não localizado. Confira o número ou tente sem complemento.',
        },
        { status:lastServiceError ? 502 : 404 },
      )
    }

    const latitude = Number(matched.lat)
    const longitude = Number(matched.lon)

    return NextResponse.json({
      latitude,
      longitude,
      displayName:String(matched.display_name ?? address),
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
