'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function ProjectRefresher({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    // 15s em vez de 5s, e pula o refresh (que reconsulta o projeto inteiro
    // no Postgres) enquanto a aba estiver em segundo plano.
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }, 15000)
    return () => clearInterval(interval)
  }, [router])

  return <>{children}</>
}
