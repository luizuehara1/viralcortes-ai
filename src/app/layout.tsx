import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'ViralCortes AI — Cortes automáticos de lives e vídeos',
  description:
    'Transforme suas lives e vídeos longos em cortes virais para TikTok, Reels e Shorts com IA.',
  keywords: 'cortes virais, ai, tiktok, reels, shorts, live, vídeo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
