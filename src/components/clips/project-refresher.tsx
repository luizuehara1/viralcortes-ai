'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function ProjectRefresher({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, 5000)
    return () => clearInterval(interval)
  }, [router])

  return <>{children}</>
}
