'use client'

import { RotateCcw } from 'lucide-react'
import { DEFAULT_VIDEO_TRANSFORM, type VideoTransform } from '@/types'

interface Props {
  transform: VideoTransform | undefined
  onChange: (transform: VideoTransform) => void
}

// Zoom/posição do vídeo principal — versão "básica" pedida primeiro (antes de
// crop avançado, facecam e presets, que ficam pra depois). zoom=1/posição=0,0
// é idêntico ao comportamento de sempre (fitMode COVER), então undefined e
// DEFAULT_VIDEO_TRANSFORM são equivalentes na prática.
export function TransformPanel({ transform, onChange }: Props) {
  const t = transform ?? DEFAULT_VIDEO_TRANSFORM

  const update = (patch: Partial<VideoTransform>) => onChange({ ...t, ...patch })
  const reset = () => onChange(DEFAULT_VIDEO_TRANSFORM)

  const isDefault = t.zoom === 1 && t.positionX === 0 && t.positionY === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/70">Zoom e posição do vídeo</p>
        <button
          onClick={reset}
          disabled={isDefault}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white disabled:opacity-30 disabled:hover:text-white/40 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Resetar
        </button>
      </div>

      <p className="text-xs text-white/30 leading-relaxed">
        Aproxima e reposiciona o vídeo dentro do quadro de saída — o preview é uma aproximação, o resultado exato sai no render final.
      </p>

      <SliderRow label="Zoom" value={t.zoom} min={1} max={3} step={0.05} suffix="x" onChange={(v) => update({ zoom: v })} />
      <SliderRow label="Posição X" value={t.positionX} min={-1} max={1} step={0.02} onChange={(v) => update({ positionX: v })} />
      <SliderRow label="Posição Y" value={t.positionY} min={-1} max={1} step={0.02} onChange={(v) => update({ positionY: v })} />
    </div>
  )
}

function SliderRow({
  label, value, min, max, step, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/50">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-violet-500" />
      <span className="w-12 text-right text-white/70">{value.toFixed(2)}{suffix || ''}</span>
    </label>
  )
}
