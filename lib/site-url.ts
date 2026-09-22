export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'NEXT_PUBLIC_SITE_URL é obrigatório no build de produção.',
      )
    }

    return 'http://localhost:3000'
  }

  let url: URL

  try {
    url = new URL(configured)
  } catch {
    throw new Error('NEXT_PUBLIC_SITE_URL precisa ser uma URL válida.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('NEXT_PUBLIC_SITE_URL precisa usar http ou https.')
  }

  return url.origin
}
