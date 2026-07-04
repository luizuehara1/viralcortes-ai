'use client'

import { Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import type { EditorLayer } from '@/types'
import { LayerItem } from './layer-item'

interface Props {
  layer: EditorLayer
  duration: number
  selected: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onToggleLocked: () => void
}

const LAYER_TYPE_LABEL: Record<EditorLayer['type'], string> = {
  VIDEO: 'Vídeo',
  FACECAM: 'Facecam',
  TEXT: 'Texto',
  CAPTION: 'Legenda',
  IMAGE: 'Imagem',
  EFFECT: 'Efeito',
}

// Uma linha da timeline de camadas — rótulo + ícones visible/locked à
// esquerda, bloco da camada (LayerItem) ocupando o resto da largura.
export function LayerTrack({ layer, duration, selected, onSelect, onToggleVisible, onToggleLocked }: Props) {
  return (
    <div className={`flex items-center gap-2 h-10 rounded-lg px-1 ${selected ? 'bg-violet-500/10' : ''}`}>
      <div className="flex items-center gap-1 w-24 shrink-0">
        <button
          onClick={onToggleVisible}
          className="p-1 rounded text-white/40 hover:text-white transition-colors"
          aria-label={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
        >
          {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onToggleLocked}
          className="p-1 rounded text-white/40 hover:text-white transition-colors"
          aria-label={layer.locked ? 'Destravar camada' : 'Travar camada'}
        >
          {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
        <span className="text-[10px] text-white/30 uppercase tracking-wide truncate">{LAYER_TYPE_LABEL[layer.type]}</span>
      </div>
      <div className="relative flex-1 h-full">
        <LayerItem layer={layer} duration={duration} selected={selected} onSelect={onSelect} />
      </div>
    </div>
  )
}
