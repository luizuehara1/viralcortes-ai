'use client'

import type { ComponentProps } from 'react'
import { VideoPreviewPlayer } from './video-preview-player'
import { TimelineScrubber } from './timeline-scrubber'
import { LayersTimeline } from './layers-timeline'
import type { EditorLayer } from '@/types'

type Props = ComponentProps<typeof VideoPreviewPlayer> & {
  duration: number
  onSeek: (time: number) => void
  onLayersChange: (layers: EditorLayer[]) => void
}

// Wrapper fino: preview (VideoPreviewPlayer, com a manipulação direta da
// camada de vídeo) + barra de play/tempo + scrubber + timeline de camadas,
// todos controlados de fora — sem estado próprio novo além do que
// VideoPreviewPlayer já mantém internamente pro próprio arraste em andamento.
export function VideoEditorCanvas({ duration, onSeek, onLayersChange, ...playerProps }: Props) {
  const { playing, onPlayingChange, currentTime, layers, selectedLayerId, onSelectLayer } = playerProps

  return (
    <div className="space-y-3">
      <VideoPreviewPlayer {...playerProps} />

      <div className="glass rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-white/40">
          <button
            onClick={() => onPlayingChange(!playing)}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            {playing ? 'Pausar' : 'Reproduzir'}
          </button>
          <span>
            {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
          </span>
        </div>
        <TimelineScrubber duration={duration} currentTime={currentTime} onSeek={onSeek} />
      </div>

      {layers && layers.length > 0 && (
        <LayersTimeline
          layers={layers}
          duration={duration}
          selectedLayerId={selectedLayerId}
          onSelectLayer={onSelectLayer ?? (() => {})}
          onLayersChange={onLayersChange}
        />
      )}
    </div>
  )
}
