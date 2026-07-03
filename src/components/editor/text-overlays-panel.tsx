'use client'

import { Plus, Trash2, Type } from 'lucide-react'
import { FONT_OPTIONS, DEFAULT_FONT_FAMILY, type TextOverlay } from '@/types'

interface Props {
  overlays: TextOverlay[]
  duration: number
  currentTime: number
  onChange: (overlays: TextOverlay[]) => void
}

export function TextOverlaysPanel({ overlays, duration, currentTime, onChange }: Props) {
  const addOverlay = () => {
    const start = currentTime
    const end = Math.min(duration, currentTime + 3)
    onChange([
      ...overlays,
      {
        id: `txt-${Date.now()}`,
        text: 'Novo texto',
        startTime: start,
        endTime: end,
        x: 0.5,
        y: 0.5,
        fontSize: 60,
        color: '#FFFFFF',
        strokeColor: '#000000',
        animation: 'none',
        fontFamily: DEFAULT_FONT_FAMILY,
      },
    ])
  }

  const updateOverlay = (id: string, patch: Partial<TextOverlay>) =>
    onChange(overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const removeOverlay = (id: string) => onChange(overlays.filter((o) => o.id !== id))

  return (
    <div className="space-y-3">
      <button
        onClick={addOverlay}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <Type className="w-3.5 h-3.5" />
        Adicionar texto no tempo atual
      </button>

      {overlays.length === 0 && <p className="text-xs text-white/30 text-center py-4">Nenhum texto adicionado</p>}

      <div className="max-h-[26rem] overflow-y-auto space-y-2">
        {overlays.map((overlay) => (
          <div key={overlay.id} className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                value={overlay.text}
                onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                className="flex-1 text-xs bg-white/5 rounded-lg px-2 py-1.5 text-white/80"
              />
              <button onClick={() => removeOverlay(overlay.id)} className="text-white/30 hover:text-red-400 transition-colors shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <select
              value={overlay.fontFamily || DEFAULT_FONT_FAMILY}
              onChange={(e) => updateOverlay(overlay.id, { fontFamily: e.target.value as TextOverlay['fontFamily'] })}
              className="w-full text-xs bg-white/5 rounded-lg px-2 py-1.5 text-white/70"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 text-xs text-white/40">
              <input
                type="number"
                step="0.1"
                value={overlay.startTime.toFixed(1)}
                onChange={(e) => updateOverlay(overlay.id, { startTime: Number(e.target.value) })}
                className="w-16 bg-white/5 rounded px-1.5 py-1"
              />
              até
              <input
                type="number"
                step="0.1"
                value={overlay.endTime.toFixed(1)}
                onChange={(e) => updateOverlay(overlay.id, { endTime: Number(e.target.value) })}
                className="w-16 bg-white/5 rounded px-1.5 py-1"
              />
              s
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-white/40 flex items-center gap-1.5">
                Cor
                <input
                  type="color"
                  value={overlay.color}
                  onChange={(e) => updateOverlay(overlay.id, { color: e.target.value })}
                  className="w-6 h-6 rounded border-0 bg-transparent"
                />
              </label>
              <label className="text-xs text-white/40 flex items-center gap-1.5 flex-1">
                Tamanho
                <input
                  type="range"
                  min={20}
                  max={140}
                  value={overlay.fontSize}
                  onChange={(e) => updateOverlay(overlay.id, { fontSize: Number(e.target.value) })}
                  className="flex-1 accent-violet-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-white/40 space-y-1 block">
                Posição X
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={overlay.x}
                  onChange={(e) => updateOverlay(overlay.id, { x: Number(e.target.value) })}
                  className="w-full accent-violet-500"
                />
              </label>
              <label className="text-xs text-white/40 space-y-1 block">
                Posição Y
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={overlay.y}
                  onChange={(e) => updateOverlay(overlay.id, { y: Number(e.target.value) })}
                  className="w-full accent-violet-500"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
