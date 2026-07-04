'use client'

import { useState } from 'react'
import {
  LinkIcon, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import type { SourcePlatform } from '@/types'
import { SOURCE_PLATFORM_LABELS } from '@/types'
import { PlatformIconButton } from '@/components/ui/platform-icon'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { ErrorState } from '@/components/ui/error-state'

interface Props {
  projectId: string
  onSuccess: (sourceVideoId: string) => void
  onSwitchToUpload?: () => void
}

interface ValidatedLink {
  platform: SourcePlatform
  title: string
  duration: number | null
  thumbnail: string | null
  isLive: boolean
}

const PLATFORM_BADGES: { platform: SourcePlatform; label: string }[] = [
  { platform: 'YOUTUBE', label: 'YouTube' },
  { platform: 'TWITCH', label: 'Twitch' },
  { platform: 'KICK', label: 'Kick' },
  { platform: 'TIKTOK', label: 'TikTok' },
  { platform: 'INSTAGRAM', label: 'Instagram' },
  { platform: 'FACEBOOK', label: 'Facebook' },
  { platform: 'OTHER', label: 'Outro link' },
]

const LONG_VIDEO_THRESHOLD_SECONDS = 3 * 3600

export function VideoLinkImport({ projectId, onSuccess, onSwitchToUpload }: Props) {
  const [url, setUrl] = useState('')
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState<ValidatedLink | null>(null)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const resetValidation = () => {
    setValidated(null)
    setError('')
    setErrorCode(null)
  }

  const validate = async () => {
    if (!url.trim()) return
    setValidating(true)
    setError('')
    setErrorCode(null)
    setValidated(null)
    try {
      const res = await fetch('/api/projects/validate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) {
        setErrorCode(body?.errorCode ?? null)
        throw new Error(
          body?.error || 'Não foi possível importar esse link automaticamente. Baixe o vídeo e envie pelo upload manual.'
        )
      }
      setValidated(body)
    } catch (err: any) {
      setError(err.message || 'Falha ao validar o link')
    } finally {
      setValidating(false)
    }
  }

  const createAndImport = async () => {
    if (!validated) return
    setCreating(true)
    setError('')
    setErrorCode(null)
    try {
      const res = await fetch('/api/upload/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, url: url.trim(), title: validated.title }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || 'Falha ao importar o vídeo')
      onSuccess(body.sourceVideoId)
    } catch (err: any) {
      setError(err.message || 'Falha ao importar o vídeo')
      setCreating(false)
    }
  }

  // A validação (só busca metadados) pode ser bloqueada mesmo quando o
  // download de verdade tem uma saída (downloader local) -- sem essa opção,
  // um bloqueio na validação travava o fluxo antes mesmo do vídeo entrar na
  // fila que sabe lidar com isso (ver AWAITING_LOCAL_DOWNLOAD).
  const importAnyway = async () => {
    if (!url.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/upload/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, url: url.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || 'Falha ao importar o vídeo')
      onSuccess(body.sourceVideoId)
    } catch (err: any) {
      setError(err.message || 'Falha ao importar o vídeo')
      setCreating(false)
    }
  }

  const isLongOrLive = validated && (validated.isLive || (validated.duration ?? 0) > LONG_VIDEO_THRESHOLD_SECONDS)

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/15">
        <p className="text-sm text-amber-300/80 font-medium mb-0.5">Aviso de conteúdo</p>
        <p className="text-xs text-white/40">
          Importe apenas conteúdo próprio ou com autorização do criador. Não conseguimos (nem tentamos)
          burlar login, DRM ou paywall — apenas conteúdo público acessível funciona.
        </p>
      </div>

      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <LinkIcon className="w-4 h-4 text-violet-400" />
          <label className="text-sm font-medium text-white/70">Link do vídeo ou live</label>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); resetValidation() }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
          />
          <Button
            onClick={validate}
            disabled={!url.trim()}
            loading={validating}
            variant="secondary"
            className="shrink-0"
          >
            {validating ? 'Validando...' : 'Validar link'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLATFORM_BADGES.map((p) => (
            <PlatformIconButton key={p.platform} platform={p.platform} label={p.label} active={validated?.platform === p.platform} />
          ))}
        </div>

        {error && (
          <div className="space-y-2">
            <ErrorState message={error} />
            {(errorCode === 'PLATFORM_BLOCKED_ACCESS' || errorCode === 'YOUTUBE_REQUIRES_LOGIN_OR_COOKIES') && (
              <Button onClick={importAnyway} loading={creating} className="w-full">
                {creating ? 'Enviando...' : 'Importar mesmo assim (via downloader local)'}
              </Button>
            )}
            {(errorCode === 'YOUTUBE_REQUIRES_LOGIN_OR_COOKIES' || errorCode === 'PLATFORM_BLOCKED_ACCESS') && onSwitchToUpload && (
              <Button onClick={onSwitchToUpload} variant="secondary" className="w-full">
                Enviar vídeo do PC
              </Button>
            )}
          </div>
        )}

        {validated && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Link validado — {SOURCE_PLATFORM_LABELS[validated.platform]}
            </div>

            <div className="flex items-center gap-4 p-3 rounded-xl bg-white/3">
              {validated.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={validated.thumbnail} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-24 h-14 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <ExternalLink className="w-5 h-5 text-white/20" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{validated.title}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {validated.isLive ? 'Ao vivo agora' : validated.duration ? formatDuration(validated.duration) : 'Duração desconhecida'}
                </p>
              </div>
            </div>

            {isLongOrLive && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Lives longas podem demorar para processar. O vídeo será analisado em partes.</span>
              </div>
            )}

            <Button onClick={createAndImport} loading={creating} className="w-full" size="lg">
              {creating ? 'Importando...' : 'Criar projeto e importar vídeo'}
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
