'use client'

let googleMapsPromise: Promise<any> | null = null

export function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps indisponível.'))
  }

  const w = window as any
  if (w.google?.maps) return Promise.resolve(w.google.maps)
  if (googleMapsPromise) return googleMapsPromise

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()

  if (!apiKey) {
    return Promise.reject(
      new Error('Configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para carregar o Google Maps.'),
    )
  }

  googleMapsPromise = new Promise((resolve,reject) => {
    const callbackName = '__chamaEntregaGoogleMapsReady'

    w[callbackName] = () => {
      if (w.google?.maps) {
        resolve(w.google.maps)
      } else {
        reject(new Error('Google Maps não ficou disponível.'))
      }
      try { delete w[callbackName] } catch {}
    }

    const existing = document.querySelector(
      'script[data-ce-google-maps]',
    ) as HTMLScriptElement | null

    if (existing) {
      existing.addEventListener('error',() => {
        reject(new Error('Não foi possível carregar o Google Maps.'))
      },{ once:true })
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.setAttribute('data-ce-google-maps','true')
    script.src =
      'https://maps.googleapis.com/maps/api/js'
      + '?key=' + encodeURIComponent(apiKey)
      + '&loading=async'
      + '&libraries=marker'
      + '&language=pt-BR'
      + '&region=BR'
      + '&v=weekly'
      + '&callback=' + callbackName

    script.onerror = () => {
      reject(new Error('Não foi possível carregar o Google Maps.'))
    }

    document.head.appendChild(script)
  })

  return googleMapsPromise
}
