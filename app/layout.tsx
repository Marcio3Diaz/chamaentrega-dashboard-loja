import type { Metadata } from 'next'
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
