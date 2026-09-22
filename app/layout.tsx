import type { Metadata } from 'next'
import Script from 'next/script'
import { getSiteUrl } from '@/lib/site-url'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
        url: '/images/chamaentrega-dashboard-banner.webp',
        alt: 'ChamaEntrega',
        type: 'image/webp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChamaEntrega | Rede de Entregadores e Logística para Restaurantes',
    description:
      'Organize sua entrega própria, construa sua rede de entregadores e reduza a dependência dos marketplaces com o ChamaEntrega.',
    images: ['/images/chamaentrega-dashboard-banner.webp'],
  },
}

const globalBaseStyles = `:root{--bg:#08090b;--surface:#111317;--surface-2:#171a1f;--surface-3:#20242a;--text:#f8f9fb;--muted:#9097a3;--line:rgba(255,255,255,.08);--gold:#ffb800;--gold-2:#ff8a00;--green:#20d27a;--red:#ff5f66;--blue:#4eb7ff;--radius:18px}*{box-sizing:border-box}html{min-height:100%;scroll-behavior:smooth}body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,input,textarea,select{font:inherit}button{cursor:pointer}img,svg{max-width:100%}:focus-visible{outline:2px solid #ffbd12;outline-offset:3px}`

const themeBootstrap = `(function(){try{var saved=localStorage.getItem('chamaentrega-theme');var theme=saved==='light'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <style id="global-base-styles" dangerouslySetInnerHTML={{ __html: globalBaseStyles }} />
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
