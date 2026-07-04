'use client'

import type { EditorLayer } from '@/types'
import { LayerTrack } from './layer-track'

interface Props {
  layers: EditorLayer[]
  duration: number
  selectedLayerId?: string | null
  onSelectLayer: (id: string) => void
  onLayersChange: (layers: EditorLayer[]) => void
}

// Timeline de camadas — uma track por camada, ordenada da mais alta (topo
// visual) pra mais baixa. Etapa 1 sempre mostra uma única track (vídeo
// principal); a estrutura já está pronta pra crescer quando existirem mais
// tipos de camada. visible/locked já salvam no editorState, mas o render
// ainda não os aplica pra camada VIDEO (não faz sentido "esconder" a única
// camada de vídeo existente) — passam a valer quando houver mais camadas
// (facecam/texto) que façam sentido esconder/travar de verdade.
export function LayersTimeline({ layers, duration, selectedLayerId, onSelectLayer, onLayersChange }: Props) {
  if (!layers.length) return null

  const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex)

  const patchLayer = (id: string, patch: Partial<EditorLayer>) =>
    onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  return (
    <div className="glass rounded-xl p-2 space-y-1">
      {sorted.map((layer) => (
        <LayerTrack
          key={layer.id}
          layer={layer}
          duration={duration}
          selected={selectedLayerId === layer.id}
          onSelect={() => onSelectLayer(layer.id)}
          onToggleVisible={() => patchLayer(layer.id, { visible: !layer.visible })}
          onToggleLocked={() => patchLayer(layer.id, { locked: !layer.locked })}
        />
      ))}
    </div>
  )
}
