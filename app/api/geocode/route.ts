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

type NominatimAddress = {
  road?: string
  pedestrian?: string
  footway?: string
  residential?: string
  neighbourhood?: string
  suburb?: string
  city_district?: string
  city?: string
  town?: string
  municipality?: string
  state?: string
  postcode?: string
  country_code?: string
}

type NominatimResult = {
  lat?: string
  lon?: string
  display_name?: string
  type?: string
  category?: string
  addresstype?: string
  address?: NominatimAddress
}

function normalize(value:string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\b(rua|r\.?|avenida|av\.?|travessa|estrada|rodovia|praca)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
}

function similar(expected:string,actual:string) {
  const a=normalize(expected)
  const b=normalize(actual)
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true

  const tokens=a.split(' ').filter(token => token.length >= 3)
  if (!tokens.length) return false
  const matches=tokens.filter(token => b.includes(token)).length
  return matches / tokens.length >= .6
}

function candidateScore(
  item:NominatimResult,
  expected:{
    street:string
    neighborhood:string
    city:string
    state:string
    cep:string
  },
) {
  const lat=Number(item.lat)
  const lon=Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return -1000

  // Brasil only + geographic sanity check.
  if (lat < -34 || lat > 6 || lon < -74 || lon > -32) return -1000

  const a=item.address ?? {}
  const road=a.road || a.pedestrian || a.footway || a.residential || ''
  const hood=a.neighbourhood || a.suburb || a.city_district || ''
  const candidateCity=a.city || a.town || a.municipality || ''
  const postcode=String(a.postcode ?? '').replace(/\D/g,'')
  const stateName=a.state ?? ''

  let score=0

  if (expected.street) {
    if (similar(expected.street,road)) score += 60
    else score -= 70
  }

  if (expected.neighborhood) {
    if (similar(expected.neighborhood,hood) || similar(expected.neighborhood,String(item.display_name ?? ''))) score += 22
  }

  if (expected.city) {
    if (similar(expected.city,candidateCity) || similar(expected.city,String(item.display_name ?? ''))) score += 22
    else score -= 25
  }

  if (expected.state) {
    const stateUpper=expected.state.toUpperCase()
    const hay=normalize([stateName,item.display_name ?? ''].join(' '))
    if (
      hay.includes(normalize(stateUpper))
      || (stateUpper === 'RJ' && hay.includes('rio de janeiro'))
    ) score += 10
  }

  if (expected.cep && postcode) {
    if (postcode === expected.cep) score += 30
    else if (postcode.slice(0,5) === expected.cep.slice(0,5)) score += 10
    else score -= 10
  }

  // Reject city/state-level matches when a street was supplied.
  if (
    expected.street
    && ['city','municipality','state','administrative'].includes(String(item.addresstype ?? '').toLowerCase())
  ) score -= 100

  return score
}

export async function POST(request: Request) {
  try {
    if (!isTrustedBrowserOrigin(request)) {
      return NextResponse.json({ error:'Origem não autorizada.' },{ status:403 })
    }

    if (!acceptsJson(request)) {
      return NextResponse.json({ error:'Envie os dados em JSON.' },{ status:415 })
    }

    const parsed=await readJsonWithinLimit<GeocodeRequest>(request,8*1024)

    if (!parsed.ok) {
      return NextResponse.json(
        { error:parsed.error === 'payload_too_large' ? 'Requisição muito grande.' : 'JSON inválido.' },
        { status:parsed.error === 'payload_too_large' ? 413 : 400 },
      )
    }

    const supabase=await createClient()
    const { data:claimsData }=await supabase.auth.getClaims()

    if (!claimsData?.claims?.sub) {
      return NextResponse.json(
        { error:'Sessão necessária para localizar endereços.' },
        { status:401 },
      )
    }

    const address=String(parsed.data.address ?? '').trim()
    const street=String(parsed.data.street ?? '').trim()
    const number=String(parsed.data.number ?? '').trim()
    const neighborhood=String(parsed.data.neighborhood ?? '').trim()
    const city=String(parsed.data.city ?? '').trim()
    const state=String(parsed.data.state ?? '').trim()
    const cep=String(parsed.data.cep ?? '').replace(/\D/g,'').slice(0,8)

    if (address.length < 6 && street.length < 3) {
      return NextResponse.json({ error:'Informe um endereço mais completo.' },{ status:400 })
    }

    if (address.length > 350) {
      return NextResponse.json({ error:'Endereço muito longo.' },{ status:400 })
    }

    const queries=[
      [street,number,neighborhood,city,state,'Brasil'].filter(Boolean).join(', '),
      [street,number,city,state,'Brasil'].filter(Boolean).join(', '),
      address,
      [street,neighborhood,city,state,'Brasil'].filter(Boolean).join(', '),
    ].filter((value,index,array) => value && array.indexOf(value) === index)

    const expected={ street,neighborhood,city,state,cep }
    let best:{ item:NominatimResult; score:number } | null=null
    let lastServiceError=false

    for (const query of queries) {
      const url=new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format','jsonv2')
      url.searchParams.set('limit','10')
      url.searchParams.set('countrycodes','br')
      url.searchParams.set('addressdetails','1')
      url.searchParams.set('q',query)

      try {
        const response=await fetch(url,{
          cache:'no-store',
          signal:AbortSignal.timeout(7000),
          headers:{
            Accept:'application/json',
            'Accept-Language':'pt-BR,pt;q=0.9',
            'User-Agent':'ChamaEntrega/1.0',
          },
        })

        if (!response.ok) {
          lastServiceError=true
          continue
        }

        const results=await response.json() as NominatimResult[]

        for (const item of results) {
          const score=candidateScore(item,expected)
          if (!best || score > best.score) best={ item,score }
        }

        // Strong street-level result: stop trying weaker queries.
        if (best && best.score >= 70) break
      } catch {
        lastServiceError=true
      }
    }

    // A street was supplied, so generic city-level matches are not acceptable.
    const minimumScore=street ? 45 : 15

    if (!best || best.score < minimumScore) {
      return NextResponse.json(
        {
          error:lastServiceError
            ? 'O serviço de localização não respondeu corretamente. Marque o ponto manualmente no mapa.'
            : 'Número exato não localizado. Marque o ponto correto manualmente no mapa.',
        },
        { status:lastServiceError ? 502 : 404 },
      )
    }

    return NextResponse.json({
      latitude:Number(best.item.lat),
      longitude:Number(best.item.lon),
      displayName:String(best.item.display_name ?? address),
      confidence:best.score,
    })
  } catch (error) {
    const timedOut=error instanceof DOMException && error.name === 'TimeoutError'

    return NextResponse.json(
      {
        error:timedOut
          ? 'O serviço de localização demorou para responder. Marque o ponto manualmente no mapa.'
          : 'Não foi possível localizar o endereço.',
      },
      { status:timedOut ? 504 : 500 },
    )
  }
}
