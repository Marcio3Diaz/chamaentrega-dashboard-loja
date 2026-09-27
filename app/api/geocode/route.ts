import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acceptsJson, isTrustedBrowserOrigin, readJsonWithinLimit } from '@/lib/security/origin'

export const dynamic='force-dynamic'

type GeocodeRequest={
  address?:string
  street?:string
  number?:string
  neighborhood?:string
  city?:string
  state?:string
  cep?:string
}

type GoogleAddressComponent={
  long_name:string
  short_name:string
  types:string[]
}

type GoogleResult={
  formatted_address:string
  partial_match?:boolean
  types:string[]
  geometry:{
    location:{ lat:number; lng:number }
    location_type:string
  }
  address_components:GoogleAddressComponent[]
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

function component(
  components:GoogleAddressComponent[],
  ...types:string[]
) {
  return components.find(item => types.some(type => item.types.includes(type)))
}

function compatible(expected:string,actual:string) {
  const a=normalize(expected)
  const b=normalize(actual)
  if (!a || !b) return true
  if (a === b || a.includes(b) || b.includes(a)) return true

  const tokens=a.split(' ').filter(token => token.length >= 3)
  if (!tokens.length) return true

  const matches=tokens.filter(token => b.includes(token)).length
  return matches / tokens.length >= .6
}

function scoreResult(
  result:GoogleResult,
  expected:{
    street:string
    neighborhood:string
    city:string
    state:string
    cep:string
    number:string
  },
) {
  const components=result.address_components ?? []
  const route=component(components,'route')?.long_name ?? ''
  const locality=
    component(components,'sublocality_level_1','sublocality','neighborhood')?.long_name
    ?? ''
  const city=
    component(components,'administrative_area_level_2','locality')?.long_name
    ?? ''
  const state=component(components,'administrative_area_level_1')?.short_name ?? ''
  const postal=component(components,'postal_code')?.long_name.replace(/\D/g,'') ?? ''
  const streetNumber=component(components,'street_number')?.long_name ?? ''

  let score=0

  if (expected.street) {
    if (compatible(expected.street,route)) score+=70
    else score-=100
  }

  if (expected.number) {
    if (streetNumber && normalize(streetNumber) === normalize(expected.number)) score+=30
    else if (streetNumber) score-=20
  }

  if (expected.neighborhood) {
    if (
      compatible(expected.neighborhood,locality)
      || compatible(expected.neighborhood,result.formatted_address)
    ) score+=20
  }

  if (expected.city) {
    if (
      compatible(expected.city,city)
      || compatible(expected.city,result.formatted_address)
    ) score+=20
    else score-=35
  }

  if (expected.state) {
    if (normalize(expected.state) === normalize(state)) score+=12
  }

  if (expected.cep && postal) {
    if (postal === expected.cep) score+=35
    else if (postal.slice(0,5) === expected.cep.slice(0,5)) score+=12
    else score-=15
  }

  if (result.partial_match) score-=12
  if (result.types.includes('street_address')) score+=15
  if (result.geometry?.location_type === 'ROOFTOP') score+=15
  if (result.geometry?.location_type === 'APPROXIMATE') score-=15

  return score
}

export async function POST(request:Request) {
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

    const apiKey=
      process.env.GOOGLE_MAPS_API_KEY?.trim()
      || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()

    if (!apiKey) {
      return NextResponse.json(
        { error:'Google Maps ainda não foi configurado no servidor.' },
        { status:503 },
      )
    }

    const street=String(parsed.data.street ?? '').trim()
    const number=String(parsed.data.number ?? '').trim()
    const neighborhood=String(parsed.data.neighborhood ?? '').trim()
    const city=String(parsed.data.city ?? '').trim()
    const state=String(parsed.data.state ?? '').trim()
    const cep=String(parsed.data.cep ?? '').replace(/\D/g,'').slice(0,8)
    const suppliedAddress=String(parsed.data.address ?? '').trim()

    const address=[
      street,
      number,
      neighborhood,
      city,
      state,
      cep ? cep.slice(0,5)+'-'+cep.slice(5) : '',
      'Brasil',
    ].filter(Boolean).join(', ') || suppliedAddress

    if (address.length < 6) {
      return NextResponse.json({ error:'Informe um endereço mais completo.' },{ status:400 })
    }

    const url=new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address',address)
    url.searchParams.set('key',apiKey)
    url.searchParams.set('language','pt-BR')
    url.searchParams.set('region','br')
    url.searchParams.set('bounds','-23.082,-43.796|-22.746,-43.099')

    const response=await fetch(url,{
      cache:'no-store',
      signal:AbortSignal.timeout(8000),
      headers:{ Accept:'application/json' },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error:'O Google Maps não respondeu corretamente.' },
        { status:502 },
      )
    }

    const payload=await response.json() as {
      status:string
      error_message?:string
      results?:GoogleResult[]
    }

    if (payload.status !== 'OK' || !payload.results?.length) {
      return NextResponse.json(
        {
          error:payload.status === 'ZERO_RESULTS'
            ? 'Endereço não encontrado no Google Maps. Marque o ponto manualmente.'
            : 'Não foi possível localizar o endereço no Google Maps.',
        },
        { status:payload.status === 'ZERO_RESULTS' ? 404 : 502 },
      )
    }

    const expected={ street,number,neighborhood,city,state,cep }

    const ranked=payload.results
      .map(result => ({ result,score:scoreResult(result,expected) }))
      .sort((a,b) => b.score-a.score)

    const best=ranked[0]
    const minimumScore=street ? 65 : 15

    if (!best || best.score < minimumScore) {
      return NextResponse.json(
        { error:'O Google Maps encontrou um ponto genérico. Marque o destino correto manualmente.' },
        { status:404 },
      )
    }

    const lat=Number(best.result.geometry.location.lat)
    const lng=Number(best.result.geometry.location.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error:'O Google Maps retornou uma coordenada inválida.' },
        { status:502 },
      )
    }

    return NextResponse.json({
      latitude:lat,
      longitude:lng,
      displayName:best.result.formatted_address,
      confidence:best.score,
      provider:'google',
      locationType:best.result.geometry.location_type,
    })
  } catch (error) {
    const timedOut=error instanceof DOMException && error.name === 'TimeoutError'

    return NextResponse.json(
      {
        error:timedOut
          ? 'O Google Maps demorou para responder. Marque o ponto manualmente.'
          : 'Não foi possível localizar o endereço.',
      },
      { status:timedOut ? 504 : 500 },
    )
  }
}
