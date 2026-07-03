'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Instagram, Loader2, CheckCircle2, Unlink } from 'lucide-react'
import type { SocialAccountSummary } from '@/types'

interface Props {
  initialAccount: SocialAccountSummary | null
}

export function InstagramConnectCard({ initialAccount }: Props) {
  const [account, setAccount] = useState(initialAccount)
  const [testing, setTesting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const isConnected = !!account

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/social/instagram/test', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setTestResult({ ok: true, message: `Conexão OK — @${data.account.username} respondendo normalmente.` })
        setAccount((prev) => (prev ? { ...prev, accountName: data.account.username, accountAvatar: data.account.profilePictureUrl } : prev))
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
      await fetch('/api/social/instagram/disconnect', { method: 'POST' })
      setAccount(null)
      setTestResult(null)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-600/15 flex items-center justify-center">
            <Instagram className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <p className="font-semibold">Instagram</p>
            <p className="text-xs text-white/40">Publicação de cortes como Reels</p>
          </div>
        </div>

        {isConnected ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conectado
          </span>
        ) : (
          <span className="text-xs font-medium text-white/40 bg-white/5 px-2.5 py-1 rounded-lg">Não conectado</span>
        )}
      </div>

      {isConnected && account && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3">
          {account.accountAvatar ? (
            <Image
              src={account.accountAvatar}
              alt={account.accountName || 'Conta'}
              width={36}
              height={36}
              className="rounded-full"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/10" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">@{account.accountName || 'conta_instagram'}</p>
            <p className="text-xs text-white/40 truncate">
              via Página {account.metadata?.facebookPageName || account.metadata?.facebookPageId || ''}
            </p>
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
          <a
            href="/api/auth/meta/connect"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-sm font-medium transition-colors"
          >
            <Instagram className="w-4 h-4" />
            Conectar Instagram
          </a>
        ) : (
          <>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-600 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Testar conexão
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 text-sm font-medium text-white/60 transition-colors"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
              Desconectar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
