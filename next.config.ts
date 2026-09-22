import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=(self)',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  })
}

const noIndexSources = [
  '/admin/:path*',
  '/painel/:path*',
  '/chat/:path*',
  '/configuracoes/:path*',
  '/despacho/:path*',
  '/entregadores/:path*',
  '/entregas/:path*',
  '/financeiro/:path*',
  '/integracoes/:path*',
  '/mapa/:path*',
  '/pedidos/:path*',
  '/onboarding/:path*',
  '/login',
  '/cadastro',
  '/forgot-password',
  '/reset-password',
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      ...noIndexSources.map(source => ({
        source,
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet',
          },
        ],
      })),
    ]
  },
}

export default nextConfig
