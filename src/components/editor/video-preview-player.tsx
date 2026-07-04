'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FONT_OPTIONS, DEFAULT_FONT_FAMILY,
  type TextOverlay, type CaptionSegment, type CaptionStyle, type FontFamilyId,
  type SplitLayoutRegion, type SplitLayoutMode,
} from '@/types'

interface SeekRequest {
  time: number // segundos, relativo ao início do clipe
  token: number
}

interface Props {
  // URL do stream a tocar — /api/videos/[id]/stream para um clipe (janela
  // dentro do vídeo fonte maior) ou /api/template-outputs/[id]/stream para
  // um resultado do Template Studio (o arquivo inteiro já É o conteúdo).
  videoSrc: string
  clipStart: number
  clipEnd: number
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  seekRequest: SeekRequest | null
  currentTime: number // relativo ao clipe — usado só pra desenhar os overlays
  onTimeUpdate: (relativeTime: number) => void
  overlays: TextOverlay[]
  captions: CaptionSegment[]
  captionStyle: CaptionStyle
  // Arrastar o texto direto no preview (em vez de só pelos sliders X/Y do
  // painel) — omitido = overlays não ficam arrastáveis (ex.: se um dia essa
  // preview for usada só pra visualização).
  onOverlayMove?: (id: string, x: number, y: number) => void
  // Layout split-screen (facecam) — desenha o retângulo da facecam
  // (arrastável) e uma linha pontilhada mostrando onde a divisão acontece.
  // É uma aproximação visual (o vídeo aqui é o fonte cru, sem o corte/zoom
  // final) — o resultado exato só aparece depois de renderizar.
  splitLayout?: { region: SplitLayoutRegion; splitRatio: number; mode: SplitLayoutMode }
  onSplitLayoutRegionMove?: (x: number, y: number) => void
}

const FONT_CSS_FAMILY: Record<FontFamilyId, string> = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.id, f.cssFamily])
) as Record<FontFamilyId, string>

function cssFontFamily(fontFamily?: FontFamilyId): string {
  return FONT_CSS_FAMILY[fontFamily || DEFAULT_FONT_FAMILY]
}

const CAPTION_POSITION_TOP: Record<CaptionStyle['position'], string> = {
  top: '8%',
  center: '50%',
  bottom: '85%',
}

// Overlays/legendas foram definidos pensando num frame de referência de
// 1080px de largura (mesma convenção usada em lib/ffmpeg.ts ao queimar o
// vídeo final) — medir a largura real do player via ResizeObserver e
// escalar por (largura real / 1080) é o que faz o preview bater com o
// resultado renderizado, em vez de usar um fator fixo que erra em telas
// diferentes.
export function VideoPreviewPlayer({
  videoSrc,
  clipStart,
  clipEnd,
  playing,
  onPlayingChange,
  seekRequest,
  currentTime,
  onTimeUpdate,
  overlays,
  captions,
  captionStyle,
  onOverlayMove,
  splitLayout,
  onSplitLayoutRegionMove,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const [scale, setScale] = useState(1)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Offset entre o ponto onde o usuário clicou e o canto superior-esquerdo
  // do retângulo, em fração 0-1 — sem isso, o retângulo "pularia" pro
  // cursor no instante do clique em vez de simplesmente se mover junto.
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const [draggingRegion, setDraggingRegion] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setScale(width / 1080)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleLoadedMetadata = () => {
      if (!initializedRef.current) {
        video.currentTime = clipStart
        initializedRef.current = true
      }
    }
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata)
  }, [clipStart])

  useEffect(() => {
    if (!seekRequest) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = clipStart + Math.max(0, seekRequest.time)
  }, [seekRequest, clipStart])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) video.play().catch(() => {})
    else video.pause()
  }, [playing])

  // Arrastar o overlay direto no preview — mais intuitivo que só os sliders
  // X/Y do painel. Ouve mousemove/mouseup na window (não só no elemento)
  // porque o cursor sai da caixa do texto facilmente durante o arraste.
  useEffect(() => {
    if (!draggingId || !onOverlayMove) return

    const handleMove = (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      onOverlayMove(draggingId, x, y)
    }
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) handleMove(touch.clientX, touch.clientY)
    }
    const stopDragging = () => setDraggingId(null)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', stopDragging)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', stopDragging)
    }
  }, [draggingId, onOverlayMove])

  // Arrastar o retângulo da facecam — mantém largura/altura fixas (só o
  // painel de campos numéricos redimensiona), igual decidido: arrastar move,
  // campos ajustam tamanho.
  useEffect(() => {
    if (!draggingRegion || !onSplitLayoutRegionMove || !dragOffset || !splitLayout) return

    const handleMove = (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const { width, height } = splitLayout.region
      const x = Math.min(1 - width, Math.max(0, (clientX - rect.left) / rect.width - dragOffset.dx))
      const y = Math.min(1 - height, Math.max(0, (clientY - rect.top) / rect.height - dragOffset.dy))
      onSplitLayoutRegionMove(x, y)
    }
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) handleMove(touch.clientX, touch.clientY)
    }
    const stopDragging = () => { setDraggingRegion(false); setDragOffset(null) }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', stopDragging)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDragging)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', stopDragging)
    }
  }, [draggingRegion, dragOffset, onSplitLayoutRegionMove, splitLayout])

  const startDraggingRegion = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !splitLayout) return
    const px = (clientX - rect.left) / rect.width
    const py = (clientY - rect.top) / rect.height
    setDragOffset({ dx: px - splitLayout.region.x, dy: py - splitLayout.region.y })
    setDraggingRegion(true)
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    if (video.currentTime >= clipEnd) {
      video.pause()
      onPlayingChange(false)
      onTimeUpdate(clipEnd - clipStart)
      return
    }
    onTimeUpdate(Math.max(0, video.currentTime - clipStart))
  }

  const visibleOverlays = overlays.filter((o) => currentTime >= o.startTime && currentTime <= o.endTime)
  const activeWord = captions.flatMap((s) => s.words).find((w) => currentTime >= w.start && currentTime <= w.end)

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-xl overflow-hidden mx-auto"
      style={{ aspectRatio: '9 / 16', maxHeight: 640 }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full object-contain bg-black"
        onTimeUpdate={handleTimeUpdate}
        playsInline
      />

      {visibleOverlays.map((overlay) => (
        <div
          key={overlay.id}
          onMouseDown={onOverlayMove ? (e) => { e.preventDefault(); setDraggingId(overlay.id) } : undefined}
          onTouchStart={onOverlayMove ? () => setDraggingId(overlay.id) : undefined}
          className={`absolute font-bold text-center leading-tight select-none ${
            onOverlayMove ? 'cursor-move' : 'pointer-events-none'
          } ${draggingId === overlay.id ? 'outline outline-2 outline-violet-400 outline-dashed' : ''}`}
          style={{
            left: `${overlay.x * 100}%`,
            top: `${overlay.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            color: overlay.color,
            fontFamily: cssFontFamily(overlay.fontFamily),
            WebkitTextStroke: `${2 * scale}px ${overlay.strokeColor}`,
            fontSize: `${overlay.fontSize * scale}px`,
            maxWidth: '90%',
            zIndex: 10,
          }}
        >
          {overlay.text}
        </div>
      ))}

      {splitLayout && (
        <>
          {/* Linha pontilhada mostrando onde a divisão entre os dois painéis
              acontece — só uma referência aproximada (o vídeo aqui é o fonte
              cru, o corte/zoom final só aparece depois de renderizar). */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-white/50 pointer-events-none"
            style={{ top: `${splitLayout.splitRatio * 100}%` }}
          />
          <div
            onMouseDown={onSplitLayoutRegionMove ? (e) => { e.preventDefault(); startDraggingRegion(e.clientX, e.clientY) } : undefined}
            onTouchStart={onSplitLayoutRegionMove ? (e) => { const t = e.touches[0]; if (t) startDraggingRegion(t.clientX, t.clientY) } : undefined}
            className={`absolute border-2 border-violet-400 bg-violet-500/20 ${onSplitLayoutRegionMove ? 'cursor-move' : 'pointer-events-none'} ${draggingRegion ? 'outline outline-2 outline-violet-300' : ''}`}
            style={{
              left: `${splitLayout.region.x * 100}%`,
              top: `${splitLayout.region.y * 100}%`,
              width: `${splitLayout.region.width * 100}%`,
              height: `${splitLayout.region.height * 100}%`,
              zIndex: 10,
            }}
          >
            <span className="absolute -top-5 left-0 text-[10px] text-violet-300 whitespace-nowrap">Facecam</span>
          </div>
        </>
      )}

      {activeWord && (
        <div
          className="absolute left-1/2 pointer-events-none font-extrabold whitespace-nowrap"
          style={{
            top: CAPTION_POSITION_TOP[captionStyle.position],
            transform: 'translate(-50%, -50%)',
            color: captionStyle.highlightColor,
            fontFamily: cssFontFamily(captionStyle.fontFamily),
            WebkitTextStroke: `${3 * scale}px ${captionStyle.strokeColor}`,
            fontSize: `${captionStyle.fontSize * scale}px`,
          }}
        >
          {activeWord.word}
        </div>
      )}

      {!playing && (
        <button
          onClick={() => onPlayingChange(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="Reproduzir"
        >
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
            <div className="w-0 h-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-black ml-1" />
          </div>
        </button>
      )}
    </div>
  )
}
