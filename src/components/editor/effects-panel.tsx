'use client'

import { Sun, ZoomIn, Trash2 } from 'lucide-react'
import type { Effect, ColorFilterParams, ZoomPanParams } from '@/types'

interface Props {
  effects: Effect[]
  duration: number
  currentTime: number
  onChange: (effects: Effect[]) => void
}

export function EffectsPanel({ effects, duration, currentTime, onChange }: Props) {
  const addEffect = (type: Effect['type']) => {
    const start = currentTime
    const end = Math.min(duration, currentTime + 3)
    const params: ColorFilterParams | ZoomPanParams =
      type === 'colorFilter' ? { brightness: 0, contrast: 1.1, saturation: 1.2 } : { fromScale: 1, toScale: 1.15 }
    onChange([...effects, { id: `fx-${Date.now()}`, type, startTime: start, endTime: end, params }])
  }

  const updateEffect = (id: string, patch: Partial<Effect>) => onChange(effects.map((e) => (e.id === id ? { ...e, ...patch } as Effect : e)))
  const removeEffect = (id: string) => onChange(effects.filter((e) => e.id !== id))

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => addEffect('colorFilter')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors"
        >
          <Sun className="w-3.5 h-3.5" /> Filtro de cor
        </button>
        <button
          onClick={() => addEffect('zoomPan')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" /> Zoom/Pan
        </button>
      </div>

      {effects.length === 0 && <p className="text-xs text-white/30 text-center py-4">Nenhum efeito adicionado</p>}

      <div className="max-h-[26rem] overflow-y-auto space-y-2">
        {effects.map((effect) => (
          <div key={effect.id} className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{effect.type === 'colorFilter' ? 'Filtro de cor' : 'Zoom/Pan'}</span>
              <button onClick={() => removeEffect(effect.id)} className="text-white/30 hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/40">
              <input
                type="number"
                step="0.1"
                value={effect.startTime.toFixed(1)}
                onChange={(e) => updateEffect(effect.id, { startTime: Number(e.target.value) })}
                className="w-16 bg-white/5 rounded px-1.5 py-1"
              />
              até
              <input
                type="number"
                step="0.1"
                value={effect.endTime.toFixed(1)}
                onChange={(e) => updateEffect(effect.id, { endTime: Number(e.target.value) })}
                className="w-16 bg-white/5 rounded px-1.5 py-1"
              />
              s
            </div>

            {effect.type === 'colorFilter' ? (
              <ColorFilterControls
                params={effect.params as ColorFilterParams}
                onChange={(params) => updateEffect(effect.id, { params })}
              />
            ) : (
              <ZoomPanControls params={effect.params as ZoomPanParams} onChange={(params) => updateEffect(effect.id, { params })} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ColorFilterControls({ params, onChange }: { params: ColorFilterParams; onChange: (p: ColorFilterParams) => void }) {
  return (
    <div className="space-y-1.5">
      <SliderRow label="Brilho" value={params.brightness} min={-0.5} max={0.5} step={0.05} onChange={(v) => onChange({ ...params, brightness: v })} />
      <SliderRow label="Contraste" value={params.contrast} min={0.5} max={1.8} step={0.05} onChange={(v) => onChange({ ...params, contrast: v })} />
      <SliderRow label="Saturação" value={params.saturation} min={0} max={2.5} step={0.05} onChange={(v) => onChange({ ...params, saturation: v })} />
    </div>
  )
}

function ZoomPanControls({ params, onChange }: { params: ZoomPanParams; onChange: (p: ZoomPanParams) => void }) {
  return (
    <div className="space-y-1.5">
      <SliderRow label="Zoom inicial" value={params.fromScale} min={1} max={2} step={0.05} onChange={(v) => onChange({ ...params, fromScale: v })} />
      <SliderRow label="Zoom final" value={params.toScale} min={1} max={2} step={0.05} onChange={(v) => onChange({ ...params, toScale: v })} />
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/50">
      <span className="w-20 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-violet-500" />
      <span className="w-10 text-right text-white/70">{value.toFixed(2)}</span>
    </label>
  )
}
