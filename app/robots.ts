import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

const siteUrl = getSiteUrl()

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/painel',
          '/chat',
          '/configuracoes',
          '/despacho',
          '/entregadores',
          '/entregas',
          '/financeiro',
          '/integracoes',
          '/mapa',
          '/pedidos',
          '/onboarding',
          '/login',
          '/cadastro',
          '/auth',
          '/api',
          '/forgot-password',
          '/reset-password',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
