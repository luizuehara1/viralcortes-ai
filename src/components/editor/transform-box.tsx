'use client'

interface Props {
  selected: boolean
  onSelect: () => void
  onStartMove: (clientX: number, clientY: number) => void
  onStartScale: (clientX: number, clientY: number) => void
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
type Corner = (typeof CORNERS)[number]

const CORNER_POSITION: Record<Corner, string> = {
  'top-left': 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  'top-right': 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  'bottom-left': 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  'bottom-right': 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
}

// Caixa de seleção/manipulação da camada de vídeo — só visual, sem
// matemática de arraste aqui (isso vive em video-preview-player.tsx, que já
// tem o containerRef necessário pra converter coordenada de tela em fração
// 0-1). O vídeo sempre preenche o quadro inteiro (cover-fill) — não existe
// uma caixa menor que a tela, então "redimensionar pelos cantos" é um gesto
// de zoom ao redor do centro, não um resize de verdade.
export function TransformBox({ selected, onSelect, onStartMove, onStartScale }: Props) {
  return (
    <div
      className={`absolute inset-0 ${selected ? 'cursor-move' : 'cursor-pointer'}`}
      style={{ zIndex: 15 }}
      onMouseDown={(e) => {
        e.preventDefault()
        if (!selected) {
          onSelect()
          return
        }
        onStartMove(e.clientX, e.clientY)
      }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (!t) return
        if (!selected) {
          onSelect()
          return
        }
        onStartMove(t.clientX, t.clientY)
      }}
    >
      {selected && (
        <div className="absolute inset-0 border-2 border-violet-400 pointer-events-none">
          {CORNERS.map((corner) => (
            <div
              key={corner}
              className={`absolute w-4 h-4 rounded-full bg-violet-400 border-2 border-white shadow pointer-events-auto ${CORNER_POSITION[corner]}`}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onStartScale(e.clientX, e.clientY)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                const t = e.touches[0]
                if (t) onStartScale(t.clientX, t.clientY)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
