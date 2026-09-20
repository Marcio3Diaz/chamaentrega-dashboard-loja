import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ChamaEntrega | Loja',
  description: 'Painel operacional das lojas ChamaEntrega',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
