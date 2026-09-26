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

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`,{
      cache:'no-store',
      signal:AbortSignal.timeout(6000),
      headers:{
        Accept:'application/json',
        'User-Agent':'ChamaEntrega/1.0',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error:'O serviço de CEP não respondeu.' },
        { status:502 },
      )
    }

    const payload = await response.json() as ViaCepResponse

    if (payload.erro) {
      return NextResponse.json(
        { error:'CEP não encontrado.' },
        { status:404 },
      )
    }

    return NextResponse.json({
      cep:payload.cep ?? cep,
      street:String(payload.logradouro ?? ''),
      complement:String(payload.complemento ?? ''),
      neighborhood:String(payload.bairro ?? ''),
      city:String(payload.localidade ?? ''),
      state:String(payload.uf ?? ''),
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
