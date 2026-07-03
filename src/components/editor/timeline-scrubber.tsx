'use client'

interface Props {
  duration: number
  currentTime: number
  onSeek: (time: number) => void
}

// Barra de progresso simples com clique/arraste para buscar — o corte em si
// (start/end) já foi decidido na sugestão de IA, o editor não re-corta,
// só permite navegar dentro da janela do clipe pra posicionar textos/efeitos.
export function TimelineScrubber({ duration, currentTime, onSeek }: Props) {
  const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onSeek(clickRatio * duration)
  }

  return (
    <div
      className="relative h-3 rounded-full bg-white/10 cursor-pointer group"
      onClick={handleSeek}
      onMouseMove={(e) => {
        if (e.buttons === 1) handleSeek(e)
      }}
    >
      <div className="absolute inset-y-0 left-0 bg-violet-500 rounded-full transition-[width]" style={{ width: `${ratio * 100}%` }} />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow group-hover:scale-110 transition-transform"
        style={{ left: `calc(${ratio * 100}% - 7px)` }}
      />
    </div>
  )
}
