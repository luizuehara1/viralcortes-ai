'use client'

import { useState } from 'react'
import {
  LinkIcon, Loader2, CheckCircle2, AlertCircle, AlertTriangle, ExternalLink,
} from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import type { SourcePlatform } from '@/types'
import { SOURCE_PLATFORM_LABELS } from '@/types'

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

      <div className="glass rounded-2xl p-6 space-y-4">
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
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 transition-all"
          />
          <button
            onClick={validate}
            disabled={!url.trim() || validating}
            className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 font-medium transition-all flex items-center gap-2 shrink-0"
          >
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {validating ? 'Validando...' : 'Validar link'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PLATFORM_BADGES.map((p) => (
            <span
              key={p.platform}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                validated?.platform === p.platform
                  ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                  : 'border-white/10 text-white/30'
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>

        {error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {errorCode === 'YOUTUBE_REQUIRES_LOGIN_OR_COOKIES' && onSwitchToUpload && (
              <button
                onClick={onSwitchToUpload}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition-all"
              >
                Enviar vídeo do PC
              </button>
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

            <button
              onClick={createAndImport}
              disabled={creating}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {creating ? 'Importando...' : 'Criar projeto e importar vídeo'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
