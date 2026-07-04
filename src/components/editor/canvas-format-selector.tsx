'use client'

import { Monitor } from 'lucide-react'
import { CANVAS_PRESETS, CANVAS_PRESET_LABELS, DEFAULT_EDITOR_CANVAS, type CanvasPreset, type EditorCanvas } from '@/types'

interface Props {
  canvas: EditorCanvas | undefined
  onChange: (canvas: EditorCanvas) => void
}

const PRESET_ORDER: CanvasPreset[] = ['TIKTOK_9_16', 'YOUTUBE_16_9', 'SQUARE_1_1', 'FEED_4_5', 'ORIGINAL']

// Seletor de "Formato de saída" — ausente/nunca escolhido = TikTok/Reels/
// Shorts 9:16 (DEFAULT_EDITOR_CANVAS), conforme pedido explícito de padrão.
// Cada preset já mapeia 1:1 pro ClipFormat que o render sempre usou
// (FORMAT_DIMENSIONS em ffmpeg.ts) — não precisou de nenhum código novo de
// render, só essa tradução de nome amigável.
export function CanvasFormatSelector({ canvas, onChange }: Props) {
  const current = canvas ?? DEFAULT_EDITOR_CANVAS
  return (
    <label className="flex items-center gap-2 text-xs text-white/50">
      <Monitor className="w-3.5 h-3.5 shrink-0" />
      <select
        value={current.preset}
        onChange={(e) => onChange(CANVAS_PRESETS[e.target.value as CanvasPreset])}
        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500/50"
      >
        {PRESET_ORDER.map((preset) => (
          <option key={preset} value={preset}>{CANVAS_PRESET_LABELS[preset]}</option>
        ))}
      </select>
    </label>
  )
}
