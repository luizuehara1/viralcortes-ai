'use client'

import { useState } from 'react'
import { X, Loader2, CalendarClock, AlertCircle, CheckCircle2, Copy, Check, Download, Instagram, Youtube } from 'lucide-react'

type Platform = 'INSTAGRAM_REELS' | 'YOUTUBE_SHORTS'

interface Props {
  sourceType: 'CLIP' | 'TEMPLATE_OUTPUT'
  sourceId: string
  defaultPlatform?: Platform
  defaultTitle?: string
  defaultCaption?: string
  defaultHashtags?: string[]
  downloadUrl?: string
  onClose: () => void
}

const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM_REELS: 'Instagram Reels',
  YOUTUBE_SHORTS: 'YouTube Shorts',
}

// now + 5min, formatado pro input datetime-local (que espera hora local,
// não UTC) — evita que o usuário consiga agendar "no passado" por engano.
function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function firstSentence(text: string, maxLen = 60): string {
  const cut = text.split(/[.!?\n]/)[0].trim()
  return (cut.length > maxLen ? `${cut.slice(0, maxLen)}...` : cut) || 'Corte viral'
}

export function ScheduleModal({
  sourceType,
  sourceId,
  defaultPlatform = 'INSTAGRAM_REELS',
  defaultTitle,
  defaultCaption,
  defaultHashtags,
  downloadUrl,
  onClose,
}: Props) {
  const [platform, setPlatform] = useState<Platform>(defaultPlatform)
  const [title, setTitle] = useState(defaultTitle || (defaultCaption ? firstSentence(defaultCaption) : ''))
  const [caption, setCaption] = useState(defaultCaption || '')
  const [hashtagsText, setHashtagsText] = useState((defaultHashtags || []).map((h) => `#${h}`).join(' '))
  const [scheduledAt, setScheduledAt] = useState(minDateTimeLocal())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const hashtags = hashtagsText
    .split(/\s+/)
    .map((h) => h.replace(/^#/, '').trim())
    .filter(Boolean)

  const fullText = () => {
    const parts = [title, caption, hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean)
    return parts.join('\n\n')
  }

  const copyCaption = async () => {
    await navigator.clipboard.writeText(fullText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/social/instagram/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          sourceId,
          platform,
          title: title || undefined,
          caption,
          hashtags,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao agendar publicação')
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Falha ao agendar publicação')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="glass rounded-2xl p-6 w-full max-w-md space-y-5 border border-white/10 my-8">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-violet-400" />
            Agendar publicação
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Publicação agendada! Acompanhe o status em Integrações.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setPlatform('INSTAGRAM_REELS')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  platform === 'INSTAGRAM_REELS' ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3 hover:bg-white/6'
                }`}
              >
                <Instagram className="w-4 h-4" />
                Instagram Reels
              </button>
              <button
                onClick={() => setPlatform('YOUTUBE_SHORTS')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  platform === 'YOUTUBE_SHORTS' ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3 hover:bg-white/6'
                }`}
              >
                <Youtube className="w-4 h-4" />
                YouTube Shorts
              </button>
            </div>

            {platform === 'YOUTUBE_SHORTS' && (
              <p className="text-xs text-white/40 -mt-2">
                Publica como Short (privado com agendamento nativo, se a data for no futuro; público
                assim que subir, se for agora).
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Título</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Título do vídeo..."
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">
                {platform === 'YOUTUBE_SHORTS' ? 'Descrição' : 'Legenda'}
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                rows={3}
                placeholder="Escreva o texto do post..."
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm resize-none focus:outline-none focus:border-violet-500/50"
              />
              <p className="text-xs text-white/30 text-right">{caption.length}/2200</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Hashtags</label>
              <input
                value={hashtagsText}
                onChange={(e) => setHashtagsText(e.target.value)}
                placeholder="#viral #reels #shorts"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Data</label>
                <input
                  type="date"
                  value={scheduledAt.slice(0, 10)}
                  min={minDateTimeLocal().slice(0, 10)}
                  onChange={(e) => setScheduledAt(`${e.target.value}T${scheduledAt.slice(11)}`)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">Horário</label>
                <input
                  type="time"
                  value={scheduledAt.slice(11)}
                  onChange={(e) => setScheduledAt(`${scheduledAt.slice(0, 10)}T${e.target.value}`)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={copyCaption}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar legenda'}
              </button>
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  download
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar vídeo
                </a>
              ) : (
                <div />
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || !caption.trim()}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 font-semibold transition-all flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
              {submitting ? 'Salvando...' : 'Salvar agendamento'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
