import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'ChamaEntrega | Loja',
  description: 'Painel operacional das lojas ChamaEntrega — Chamou, Chegou',
  icons: {
    icon: '/brand/chamaentrega-flame-official.webp',
    shortcut: '/brand/chamaentrega-flame-official.webp',
    apple: '/brand/chamaentrega-flame-official.webp',
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
