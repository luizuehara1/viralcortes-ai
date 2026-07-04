'use client'

import { RotateCcw } from 'lucide-react'
import { DEFAULT_LAYER_TRANSFORM, type EditorLayer, type LayerTransform } from '@/types'

interface Props {
  layer: EditorLayer | undefined
  onChange: (patch: Partial<LayerTransform>) => void
}

// Painel de propriedades da camada selecionada — Etapa 1 só mexe em
// zoom/x/y da camada VIDEO (mesmos 3 controles do antigo TransformPanel,
// agora ligados em layers[0].transform). Sem sliders de rotação/opacidade/
// crop ainda — eles existem no tipo mas não têm efeito no render por ora,
// um slider que não faz nada é pior UX do que não ter o slider.
export function PropertiesPanel({ layer, onChange }: Props) {
  if (!layer) {
    return <p className="text-xs text-white/30 text-center py-4">Nenhuma camada selecionada — clique no vídeo no preview.</p>
  }

  const t = layer.transform
  const isDefault = t.scale === 1 && t.x === 0 && t.y === 0
  const reset = () => onChange({ scale: DEFAULT_LAYER_TRANSFORM.scale, x: DEFAULT_LAYER_TRANSFORM.x, y: DEFAULT_LAYER_TRANSFORM.y })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{layer.name}</p>
          <p className="text-xs text-white/30">Clique e arraste no preview pra mover — arraste um canto pra dar zoom.</p>
        </div>
        <button
          onClick={reset}
          disabled={isDefault}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white disabled:opacity-30 disabled:hover:text-white/40 transition-colors shrink-0"
        >
          <RotateCcw className="w-3 h-3" /> Resetar
        </button>
      </div>

      <SliderRow label="Zoom" value={t.scale} min={1} max={4} step={0.05} suffix="x" onChange={(v) => onChange({ scale: v })} />
      <SliderRow label="Posição X" value={t.x} min={-1} max={1} step={0.02} onChange={(v) => onChange({ x: v })} />
      <SliderRow label="Posição Y" value={t.y} min={-1} max={1} step={0.02} onChange={(v) => onChange({ y: v })} />
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
