import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  applicationName: 'ChamaEntrega',
  title: {
    default: 'ChamaEntrega | Rede de Entregadores e Logística para Restaurantes',
    template: '%s | ChamaEntrega',
  },
  description:
    'Organize sua entrega própria, construa sua rede de entregadores e reduza a dependência dos marketplaces com o ChamaEntrega.',
  keywords: [
    'ChamaEntrega',
    'entrega própria',
    'entregadores',
    'logística para restaurantes',
    'delivery para restaurantes',
    'rede de entregadores',
    'gestão de entregas',
    'entrega sob demanda',
  ],
  authors: [{ name: 'ChamaEntrega' }],
  creator: 'ChamaEntrega',
  publisher: 'ChamaEntrega',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: '/brand/chamaentrega-flame-official.webp',
    shortcut: '/brand/chamaentrega-flame-official.webp',
    apple: '/brand/chamaentrega-flame-official.webp',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'ChamaEntrega',
    title: 'ChamaEntrega | Rede de Entregadores e Logística para Restaurantes',
    description:
      'Organize sua entrega própria, construa sua rede de entregadores e reduza a dependência dos marketplaces com o ChamaEntrega.',
    images: [
      {
        url: '/images/chamaentrega-dashboard-banner.avif',
        alt: 'ChamaEntrega',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChamaEntrega | Rede de Entregadores e Logística para Restaurantes',
    description:
      'Organize sua entrega própria, construa sua rede de entregadores e reduza a dependência dos marketplaces com o ChamaEntrega.',
    images: ['/images/chamaentrega-dashboard-banner.avif'],
  },
}

const themeBootstrap = `(function(){try{var saved=localStorage.getItem('chamaentrega-theme');var theme=saved==='light'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
