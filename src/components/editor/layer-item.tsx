'use client'

import type { EditorLayer } from '@/types'

interface Props {
  layer: EditorLayer
  duration: number
  selected: boolean
  onSelect: () => void
}

// Bloco de uma camada dentro da track — na Etapa 1 sempre ocupa a duração
// inteira do corte e não é arrastável/redimensionável no tempo ainda (isso
// fica pra quando existirem camadas com janela de tempo própria, tipo
// texto/efeito por trecho).
export function LayerItem({ layer, duration, selected, onSelect }: Props) {
  const startPct = duration > 0 ? (layer.startTime / duration) * 100 : 0
  const widthPct = duration > 0 ? ((layer.endTime - layer.startTime) / duration) * 100 : 100

  return (
    <button
      onClick={onSelect}
      className={`absolute top-1 bottom-1 rounded-md border text-left px-2 flex items-center text-xs font-medium transition-colors overflow-hidden whitespace-nowrap ${
        selected
          ? 'border-violet-400 bg-violet-500/25 text-white'
          : 'border-white/10 bg-white/8 text-white/60 hover:bg-white/12'
      }`}
      style={{ left: `${startPct}%`, width: `${widthPct}%` }}
    >
      {layer.name}
    </button>
  )
}
