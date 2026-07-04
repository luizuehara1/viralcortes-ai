'use client'

import { useState } from 'react'
import { Copy, Check, Download } from 'lucide-react'
import { CLIP_FORMAT_LABELS } from '@/types'
import type { ClipFormat } from '@/types'
import { Modal } from '@/components/ui/modal'

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
    <Modal onClose={onClose} title="Exportar para postar" maxWidth="max-w-md">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-600 hover:bg-neon-500 text-black text-xs font-semibold transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar
              </a>
            </div>
            {PLATFORM_HINTS[r.format] && <p className="text-xs text-white/40">{PLATFORM_HINTS[r.format]}</p>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
