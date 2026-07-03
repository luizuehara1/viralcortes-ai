'use client'

import { useEffect, useRef, useState } from 'react'
import type { TextOverlay, CaptionSegment, CaptionStyle } from '@/types'

interface SeekRequest {
  time: number // segundos, relativo ao início do clipe
  token: number
}

interface Props {
  sourceVideoId: string
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
  sourceVideoId,
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
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const [scale, setScale] = useState(1)

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
        src={`/api/videos/${sourceVideoId}/stream`}
        className="w-full h-full object-contain bg-black"
        onTimeUpdate={handleTimeUpdate}
        playsInline
      />

      {visibleOverlays.map((overlay) => (
        <div
          key={overlay.id}
          className="absolute pointer-events-none font-bold text-center leading-tight"
          style={{
            left: `${overlay.x * 100}%`,
            top: `${overlay.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            color: overlay.color,
            WebkitTextStroke: `${2 * scale}px ${overlay.strokeColor}`,
            fontSize: `${overlay.fontSize * scale}px`,
            maxWidth: '90%',
          }}
        >
          {overlay.text}
        </div>
      ))}

      {activeWord && (
        <div
          className="absolute left-1/2 pointer-events-none font-extrabold whitespace-nowrap"
          style={{
            top: CAPTION_POSITION_TOP[captionStyle.position],
            transform: 'translate(-50%, -50%)',
            color: captionStyle.highlightColor,
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
