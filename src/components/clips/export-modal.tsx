'use client'

import { useState } from 'react'
import { X, Copy, Check, Download } from 'lucide-react'
import { CLIP_FORMAT_LABELS } from '@/types'
import type { ClipFormat } from '@/types'

interface RenderedClip {
  id: string
  format: string
  filePath: string | null
}

interface Props {
  title: string
  caption: string | null
  description: string | null
  hashtags: string[]
  renderedClips: RenderedClip[]
  onClose: () => void
}

const PLATFORM_HINTS: Record<string, string> = {
  ORIGINAL: 'Formato original — confira se serve para a plataforma desejada',
  VERTICAL_9_16: 'Ideal para TikTok, Instagram Reels e YouTube Shorts',
  HORIZONTAL_16_9: 'Ideal para YouTube (vídeo normal)',
  SQUARE_1_1: 'Ideal para feed do Instagram/Facebook',
  FEED_4_5: 'Ideal para feed do Instagram (retrato)',
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-white/40 font-medium uppercase tracking-wide">{label}</p>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <p className="text-sm text-white/70 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

// Step 1 of publishing: everything needed to post manually, no OAuth/external
// API involved yet. Publishing directly to YouTube/Instagram/TikTok needs
// developer credentials from the platform owner — this ships first because
// it works right now with zero external dependencies.
export function ExportModal({ title, caption, description, hashtags, renderedClips, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass rounded-2xl p-6 w-full max-w-md space-y-5 border border-white/10 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Exportar para postar</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <CopyField label="Título" value={title} />
        {caption && <CopyField label="Legenda" value={caption} />}
        {description && <CopyField label="Descrição" value={description} />}
        {hashtags.length > 0 && <CopyField label="Hashtags" value={hashtags.join(' ')} />}

        <div className="space-y-2">
          <p className="text-xs text-white/40 font-medium uppercase tracking-wide">Baixar arquivo</p>
          {renderedClips.map((r) => (
            <div key={r.id} className="p-3 rounded-xl bg-white/3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{CLIP_FORMAT_LABELS[r.format as ClipFormat] || r.format}</span>
                <a
                  href={`/api/clips/${r.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/80 hover:bg-green-600 text-xs font-medium transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar
                </a>
              </div>
              {PLATFORM_HINTS[r.format] && <p className="text-xs text-white/40">{PLATFORM_HINTS[r.format]}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
