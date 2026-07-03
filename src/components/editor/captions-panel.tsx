'use client'

import { useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import type { CaptionSegment, CaptionStyle, CaptionPosition } from '@/types'

interface Props {
  // URL da rota que gera as legendas — /api/clips/[id]/captions ou
  // /api/template-outputs/[id]/captions, dependendo de onde o editor está
  // sendo usado.
  captionsEndpoint: string
  captions: CaptionSegment[]
  captionStyle: CaptionStyle
  captionsGeneratedAt?: string
  onCaptionsGenerated: (captions: CaptionSegment[]) => void
  onStyleChange: (style: CaptionStyle) => void
  onEditSegment: (id: string, text: string) => void
}

const POSITION_LABELS: Record<CaptionPosition, string> = { top: 'Topo', center: 'Centro', bottom: 'Base' }

export function CaptionsPanel({
  captionsEndpoint,
  captions,
  captionStyle,
  captionsGeneratedAt,
  onCaptionsGenerated,
  onStyleChange,
  onEditSegment,
}: Props) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(captionsEndpoint, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Falha ao gerar legendas')
      } else {
        onCaptionsGenerated(data.editorState.captions)
      }
    } catch {
      setError('Falha na conexão')
    }
    setGenerating(false)
  }

  return (
    <div className="space-y-3">
      <button
        onClick={generate}
        disabled={generating}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium transition-all"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {generating ? 'Transcrevendo...' : captionsGeneratedAt ? 'Gerar legendas de novo' : 'Gerar legendas automáticas'}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-white/30 leading-relaxed">
        Estilo &quot;palavra em destaque&quot; — uma palavra grande por vez, sincronizada com a fala.
      </p>

      {captions.length > 0 && (
        <>
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">Posição</label>
            <div className="grid grid-cols-3 gap-2">
              {(['top', 'center', 'bottom'] as CaptionPosition[]).map((pos) => (
                <button
                  key={pos}
                  onClick={() => onStyleChange({ ...captionStyle, position: pos })}
                  className={`py-1.5 rounded-lg text-xs border transition-colors ${
                    captionStyle.position === pos ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3'
                  }`}
                >
                  {POSITION_LABELS[pos]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-xs text-white/40 flex items-center gap-1.5">
              Destaque
              <input
                type="color"
                value={captionStyle.highlightColor}
                onChange={(e) => onStyleChange({ ...captionStyle, highlightColor: e.target.value })}
                className="w-6 h-6 rounded border-0 bg-transparent"
              />
            </label>
            <label className="text-xs text-white/40 flex items-center gap-1.5 flex-1">
              Tamanho
              <input
                type="range"
                min={24}
                max={90}
                value={captionStyle.fontSize}
                onChange={(e) => onStyleChange({ ...captionStyle, fontSize: Number(e.target.value) })}
                className="flex-1 accent-violet-500"
              />
            </label>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1.5 block">Texto reconhecido (editável)</label>
            <div className="max-h-56 overflow-y-auto space-y-2">
              {captions.map((segment) => (
                <textarea
                  key={segment.id}
                  defaultValue={segment.editedText ?? segment.words.map((w) => w.word).join(' ')}
                  onBlur={(e) => onEditSegment(segment.id, e.target.value)}
                  className="w-full text-xs bg-white/5 rounded-lg p-2 text-white/70 resize-none"
                  rows={2}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
