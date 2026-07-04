'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Youtube, CheckCircle2, Unlink } from 'lucide-react'
import type { SocialAccountSummary } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'

interface Props {
  initialAccount: SocialAccountSummary | null
}

export function YoutubeConnectCard({ initialAccount }: Props) {
  const [account, setAccount] = useState(initialAccount)
  const [testing, setTesting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const isConnected = !!account

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/social/youtube/test', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setTestResult({ ok: true, message: `Conexão OK — canal "${data.channel.title}" respondendo normalmente.` })
        setAccount((prev) => (prev ? { ...prev, accountName: data.channel.title, accountAvatar: data.channel.thumbnailUrl } : prev))
      } else {
        setTestResult({ ok: false, message: data.error || 'Falha ao testar a conexão.' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Erro de rede ao testar a conexão.' })
    } finally {
      setTesting(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await fetch('/api/social/youtube/disconnect', { method: 'POST' })
      setAccount(null)
      setTestResult(null)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <GlassCard className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/15 flex items-center justify-center">
            <Youtube className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="font-semibold">YouTube</p>
            <p className="text-xs text-white/40">Upload de cortes como vídeos/Shorts</p>
          </div>
        </div>

        <Badge tone={isConnected ? 'success' : 'neutral'} dot>
          {isConnected ? 'Conectado' : 'Não conectado'}
        </Badge>
      </div>

      {isConnected && account && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3">
          {account.accountAvatar ? (
            <Image
              src={account.accountAvatar}
              alt={account.accountName || 'Canal'}
              width={36}
              height={36}
              className="rounded-full"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/10" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{account.accountName || 'Canal do YouTube'}</p>
            <p className="text-xs text-white/40 truncate">ID: {account.providerAccountId}</p>
          </div>
        </div>
      )}

      {testResult && (
        <div
          className={`text-xs rounded-lg px-3 py-2 ${
            testResult.ok ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="flex items-center gap-2">
        {!isConnected ? (
          <a href="/api/auth/youtube/connect">
            <Button icon={<Youtube className="w-4 h-4" />}>Conectar YouTube</Button>
          </a>
        ) : (
          <>
            <Button onClick={handleTest} loading={testing} icon={<CheckCircle2 className="w-4 h-4" />}>
              Testar conexão
            </Button>
            <Button onClick={handleDisconnect} loading={disconnecting} variant="secondary" icon={<Unlink className="w-4 h-4" />}>
              Desconectar
            </Button>
          </>
        )}
      </div>
    </GlassCard>
  )
}
