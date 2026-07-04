'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Clock, Download, Play, Sparkles, Copy, Check,
  Loader2, ChevronDown, ChevronUp, Plus, Share2, Pencil, CalendarClock, Instagram, Youtube
} from 'lucide-react'
import { EMOTION_LABELS, EMOTION_COLORS, CLIP_FORMAT_LABELS } from '@/types'
import { formatTimeCode, formatDuration, viralScoreColor, viralScoreBg } from '@/lib/utils'
import type { ClipEmotion, ClipStatus, ClipFormat, FitMode, SplitLayoutMode } from '@/types'
import { resolveFacecamLayout, saveClipLayout } from '@/lib/facecam-client'
import { FormatPickerModal, type ConfirmOutcome } from './format-picker-modal'
import { ExportModal } from './export-modal'
import { ScheduleModal } from '@/components/social/schedule-modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface RenderedClip {
  id: string
  format: string
  filePath: string | null
}

interface Clip {
  id: string
  title: string
  startTime: number
  endTime: number
  viralScore: number
  hook: string | null
  reason: string
  emotion: ClipEmotion
  caption: string | null
  description: string | null
  hashtags: string[]
  status: ClipStatus
  renderedClips: RenderedClip[]
}

interface Props {
  clip: Clip
  index: number
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

export function ClipCard({ clip, index, selectable, selected, onToggleSelect }: Props) {
  const [rendering, setRendering] = useState(false)
  const [status, setStatus] = useState<ClipStatus>(clip.status)
  const [renderedClips, setRenderedClips] = useState<RenderedClip[]>(clip.renderedClips)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [schedulePlatform, setSchedulePlatform] = useState<'INSTAGRAM_REELS' | 'YOUTUBE_SHORTS' | null>(null)

  const duration = clip.endTime - clip.startTime

  // Keep local status/renderedClips in sync whenever the server component
  // re-renders with fresh data (e.g. router.refresh() after "Gerar todos"),
  // without fighting the in-flight poll below.
  useEffect(() => {
    setStatus(clip.status)
  }, [clip.status])

  useEffect(() => {
    setRenderedClips(clip.renderedClips)
  }, [clip.renderedClips])

  const requestRender = async (
    format: ClipFormat = 'ORIGINAL',
    fitMode: FitMode = 'CONTAIN',
    layoutMode?: SplitLayoutMode | null
  ): Promise<ConfirmOutcome> => {
    setRendering(true)
    setError('')
    try {
      // Layout com facecam escolhido — precisa de uma facecamRegion válida
      // antes de enfileirar. Tenta detectar de verdade; se não conseguir,
      // NÃO segue com um palpite calado (o usuário não saberia que a
      // posição é só um chute) — devolve pro modal mostrar o aviso e o
      // atalho "Ver/Ajustar Cam" em vez de gerar um corte com facecam torta.
      if (layoutMode) {
        const { confirmed, layoutConfig } = await resolveFacecamLayout(clip.id, layoutMode)
        if (!confirmed) {
          setRendering(false)
          return { ok: false, reason: 'FACECAM_UNCONFIRMED', editorHref: `/clips/${clip.id}/editor` }
        }
        await saveClipLayout(clip.id, layoutMode, layoutConfig)
      }

      const res = await fetch(`/api/clips/${clip.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, fitMode }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        setStatus('RENDERING')
        setPickerOpen(false)
        setRendering(false)
        return { ok: true }
      }
      setError(body?.error || 'Não foi possível colocar este corte na fila de renderização. Verifique Redis/worker.')
    } catch {
      setError('Falha na conexão')
    }
    setRendering(false)
    return { ok: false, reason: 'ERROR' }
  }

  // Single source of truth for polling: fires whenever `status` becomes
  // RENDERING, however that happened (manual click, prop sync after a
  // "Gerar todos" refresh, or already-RENDERING on mount). Self-scheduling
  // (setTimeout, not setInterval) so a slow response never piles up
  // concurrent requests against the server.
  useEffect(() => {
    if (status !== 'RENDERING') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const res = await fetch(`/api/clips/${clip.id}`)
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (cancelled) return
          if (data.status === 'RENDERED' || data.status === 'FAILED') {
            setStatus(data.status)
            if (data.status === 'FAILED' && data.errorMessage) setError(data.errorMessage)
            if (data.renderedClips) setRenderedClips(data.renderedClips)
            return
          }
        }
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 3000)
    }

    timer = setTimeout(tick, 3000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [status, clip.id])

  const copyHashtags = async () => {
    await navigator.clipboard.writeText(clip.hashtags.join(' '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Reels do Instagram pede vertical — se o clipe tem uma renderização
  // 9:16, agenda essa; senão cai pra primeira renderização disponível.
  const scheduleTarget = renderedClips.find((r) => r.format === 'VERTICAL_9_16') || renderedClips[0]

  const isTopClip = clip.viralScore >= 85

  return (
    <div className={`glass rounded-2xl overflow-hidden transition-all duration-200 border relative ${
      selected ? 'border-violet-500/50' : isTopClip ? 'border-neon-500/30 shadow-neon' : 'hover:border-violet-500/20 border-white/5'
    }`}>
      {isTopClip && (
        <div className="absolute top-0 right-0 bg-gradient-neon text-black text-[10px] font-bold px-2.5 py-1 rounded-bl-lg flex items-center gap-1 z-10">
          <TrendingUp className="w-3 h-3" />
          TOP
        </div>
      )}
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 shrink-0">
            {selectable && (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={onToggleSelect}
                className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
              />
            )}
            <span className="text-xs text-white/30 font-mono w-5">#{index + 1}</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-bold border ${viralScoreBg(clip.viralScore)}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              <span className={viralScoreColor(clip.viralScore)}>{clip.viralScore}</span>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${EMOTION_COLORS[clip.emotion]}`}>
            {EMOTION_LABELS[clip.emotion]}
          </span>
        </div>

        <h3 className="font-semibold text-base leading-snug mb-2">{clip.title}</h3>

        {clip.hook && (
          <p className="text-sm text-violet-300/70 italic mb-2">
            &ldquo;{clip.hook}&rdquo;
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-white/40">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatTimeCode(clip.startTime)} → {formatTimeCode(clip.endTime)}
            </div>
            <span>·</span>
            <span>{formatDuration(duration)}</span>
          </div>
          <Link
            href={`/clips/${clip.id}/editor`}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-violet-500/20 hover:text-violet-300 text-white/50 transition-colors shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </Link>
        </div>
      </div>

      {/* Expand details */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs text-white/40 hover:text-white/60 hover:bg-white/3 transition-colors"
        >
          <span>Ver detalhes e hashtags</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <div className="px-5 pb-4 space-y-3 border-t border-white/5 pt-3">
            <div>
              <p className="text-xs text-white/40 mb-1 font-medium uppercase tracking-wide">Por que vai viralizar</p>
              <p className="text-sm text-white/70 leading-relaxed">{clip.reason}</p>
            </div>

            {clip.caption && (
              <div>
                <p className="text-xs text-white/40 mb-1 font-medium uppercase tracking-wide">Legenda</p>
                <p className="text-sm text-white/70">{clip.caption}</p>
              </div>
            )}

            {clip.hashtags.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-white/40 font-medium uppercase tracking-wide">Hashtags</p>
                  <button
                    onClick={copyHashtags}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {clip.hashtags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-white/5 p-4">
        {error && (
          <p className="text-xs text-red-400 mb-2 text-center">{error}</p>
        )}
        {status === 'SUGGESTED' || status === 'SELECTED' ? (
          <Button onClick={() => setPickerOpen(true)} loading={rendering} icon={<Sparkles className="w-4 h-4" />} className="w-full">
            {rendering ? 'Enfileirando...' : 'Gerar corte'}
          </Button>
        ) : status === 'RENDERING' ? (
          <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-violet-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Renderizando corte...
          </div>
        ) : status === 'RENDERED' && renderedClips.length > 0 ? (
          <div className="space-y-2">
            <Button onClick={() => setExportOpen(true)} icon={<Share2 className="w-4 h-4" />} className="w-full">
              Exportar para postar
            </Button>
            <button
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white/40 hover:text-violet-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Gerar outro formato
            </button>
            {scheduleTarget && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setSchedulePlatform('INSTAGRAM_REELS')} variant="secondary" size="sm" icon={<Instagram className="w-3.5 h-3.5" />}>
                  Agendar Instagram
                </Button>
                <Button onClick={() => setSchedulePlatform('YOUTUBE_SHORTS')} variant="secondary" size="sm" icon={<Youtube className="w-3.5 h-3.5" />}>
                  Agendar YouTube
                </Button>
              </div>
            )}
          </div>
        ) : status === 'FAILED' ? (
          <Button onClick={() => setPickerOpen(true)} variant="secondary" className="w-full">
            Tentar novamente
          </Button>
        ) : null}
      </div>

      {pickerOpen && (
        <FormatPickerModal
          submitting={rendering}
          error={error}
          onClose={() => setPickerOpen(false)}
          onConfirm={requestRender}
        />
      )}

      {exportOpen && (
        <ExportModal
          title={clip.title}
          caption={clip.caption}
          description={clip.description}
          hashtags={clip.hashtags}
          renderedClips={renderedClips}
          onClose={() => setExportOpen(false)}
        />
      )}

      {schedulePlatform && scheduleTarget && (
        <ScheduleModal
          sourceType="CLIP"
          sourceId={scheduleTarget.id}
          defaultPlatform={schedulePlatform}
          defaultTitle={clip.title}
          defaultCaption={[clip.caption, clip.description].filter(Boolean).join('\n\n') || undefined}
          defaultHashtags={clip.hashtags}
          downloadUrl={`/api/clips/${scheduleTarget.id}/download`}
          onClose={() => setSchedulePlatform(null)}
        />
      )}
    </div>
  )
}
