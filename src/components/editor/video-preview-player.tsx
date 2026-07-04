'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FONT_OPTIONS, DEFAULT_FONT_FAMILY,
  type TextOverlay, type CaptionSegment, type CaptionStyle, type FontFamilyId,
  type SplitLayoutRegion, type SplitLayoutMode, type VideoTransform,
  type EditorLayer, type LayerTransform,
} from '@/types'
import { TransformBox } from './transform-box'

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
  // Formato CSS (ex.: '9 / 16') do canvas de saída escolhido — o preview
  // muda de proporção junto com o formato selecionado. Default '9 / 16'
  // (TikTok/Reels/Shorts) se não informado.
  aspectRatio?: string
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
  // Layout split-screen (facecam) — renderiza os DOIS painéis já compostos
  // de verdade (cada um com seu próprio cover-crop, preservando proporção,
  // igual o ffmpeg faz) em vez de só um retângulo por cima do vídeo cru.
  // Sem round-trip no servidor: atualiza instantaneamente ao arrastar/dar
  // zoom, calculado 100% no cliente. Ainda é uma aproximação (o vídeo real
  // no servidor pode diferir por 1-2px de arredondamento), mas é fiel o
  // suficiente pra edição visual — o resultado exato só é garantido no
  // render final.
  splitLayout?: {
    mode: SplitLayoutMode
    splitRatio: number
    facecamRegion: SplitLayoutRegion
    facecamZoom: number
    mainRegion: SplitLayoutRegion
    mainZoom: number
  }
  onFacecamRegionMove?: (x: number, y: number) => void
  onMainRegionMove?: (x: number, y: number) => void
  // Zoom/posição manual do vídeo principal — aproximação via CSS (scale +
  // translate no próprio elemento <video>, recortado pelo overflow-hidden
  // do container). O resultado exato só sai no render final do ffmpeg.
  // Fallback pré-camadas — ignorado quando `layers` já tem uma camada VIDEO.
  transform?: VideoTransform
  // Sistema de camadas — Etapa 1 só desenha/manipula a camada `type: 'VIDEO'`.
  // Clicar seleciona, arrastar o corpo move, arrastar um canto dá zoom
  // (ao redor do centro — o vídeo sempre preenche o quadro inteiro, não uma
  // caixa que fica menor).
  layers?: EditorLayer[]
  selectedLayerId?: string | null
  onSelectLayer?: (id: string) => void
  onLayerTransformChange?: (id: string, patch: Partial<LayerTransform>) => void
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

interface CropBox { x: number; y: number; width: number; height: number }

// Sub-retângulo efetivo depois do zoom — mesma matemática de
// buildSplitLayoutFilters em ffmpeg.ts (corta um sub-retângulo menor e
// centralizado dentro da região, na mesma proporção), só que em fração 0-1
// em vez de pixels (não precisa saber a dimensão da fonte só pra isso).
function effectiveCropBox(region: SplitLayoutRegion, zoom: number): CropBox {
  const z = Math.max(1, zoom)
  const width = region.width / z
  const height = region.height / z
  return { x: region.x + (region.width - width) / 2, y: region.y + (region.height - height) / 2, width, height }
}

// Calcula o estilo inline do <video> pra mostrar SÓ esse crop, preenchendo o
// painel inteiro sem distorcer (equivalente a object-fit:cover, mas pra um
// sub-retângulo arbitrário da fonte em vez do frame inteiro — object-fit
// sozinho não faz isso). Precisa da dimensão real da fonte (videoWidth/
// videoHeight) e do tamanho real do painel em pixels (via ResizeObserver).
function coverCropVideoStyle(crop: CropBox, srcW: number, srcH: number, panelW: number, panelH: number): React.CSSProperties {
  if (!srcW || !srcH || !panelW || !panelH || crop.width <= 0 || crop.height <= 0) {
    return { width: '100%', height: '100%', objectFit: 'cover' }
  }
  const cropPxW = crop.width * srcW
  const cropPxH = crop.height * srcH
  const displayScale = Math.max(panelW / cropPxW, panelH / cropPxH)
  const scaledW = srcW * displayScale
  const scaledH = srcH * displayScale
  const cx = (crop.x + crop.width / 2) * srcW
  const cy = (crop.y + crop.height / 2) * srcH
  return {
    position: 'absolute',
    width: `${scaledW}px`,
    height: `${scaledH}px`,
    left: `${panelW / 2 - cx * displayScale}px`,
    top: `${panelH / 2 - cy * displayScale}px`,
    maxWidth: 'none',
  }
}

// Painel individual do layout split-screen — vídeo cropado + alça de
// arraste que cobre o painel inteiro (arrastar move a região no vídeo
// fonte, na direção oposta ao movimento do mouse — "arrastar o conteúdo",
// igual editor de foto/crop: arrastar pra direita revela conteúdo mais à
// esquerda da fonte).
function SplitPanel({
  videoRef, videoSrc, heightPercent, crop, srcSize, panelSize, label, muted, draggable, dragging, onDragStart, onPanelResize, onTimeUpdate, onError,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  videoSrc: string
  heightPercent: number
  crop: CropBox
  srcSize: { width: number; height: number }
  panelSize: { width: number; height: number }
  label: string
  muted: boolean
  draggable: boolean
  dragging: boolean
  onDragStart: (clientX: number, clientY: number) => void
  onPanelResize: (size: { width: number; height: number }) => void
  onTimeUpdate?: () => void
  onError?: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      onPanelResize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={panelRef} className="relative overflow-hidden bg-black" style={{ height: `${heightPercent}%` }}>
      {/* loadedmetadata é escutado via addEventListener direto no ref (ver
          video-preview-player.tsx) — não duplica aqui como prop React. */}
      <video
        ref={videoRef}
        src={videoSrc}
        muted={muted}
        playsInline
        onTimeUpdate={onTimeUpdate}
        onError={onError}
        style={coverCropVideoStyle(crop, srcSize.width, srcSize.height, panelSize.width, panelSize.height)}
      />
      {draggable && (
        <div
          className={`absolute inset-0 cursor-move ${dragging ? 'outline outline-2 outline-violet-400' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientX, e.clientY) }}
          onTouchStart={(e) => { const t = e.touches[0]; if (t) onDragStart(t.clientX, t.clientY) }}
        />
      )}
      <span className="absolute top-1.5 left-1.5 text-[10px] text-white/60 bg-black/50 px-1.5 py-0.5 rounded pointer-events-none">
        {label}
      </span>
    </div>
  )
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
  onFacecamRegionMove,
  onMainRegionMove,
  transform,
  layers,
  selectedLayerId,
  onSelectLayer,
  onLayerTransformChange,
  aspectRatio = '9 / 16',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const [scale, setScale] = useState(1)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [videoError, setVideoError] = useState('')

  // Layout split-screen: dois <video> (um por painel, mesma fonte) — o
  // painel principal toca com áudio (é o "condutor" de play/pause/tempo), o
  // da facecam fica mudo (senão tocaria o mesmo áudio duas vezes, ecoando).
  const splitMainVideoRef = useRef<HTMLVideoElement>(null)
  const splitFacecamVideoRef = useRef<HTMLVideoElement>(null)
  const [srcSize, setSrcSize] = useState({ width: 0, height: 0 })
  const [mainPanelSize, setMainPanelSize] = useState({ width: 0, height: 0 })
  const [facecamPanelSize, setFacecamPanelSize] = useState({ width: 0, height: 0 })
  const [draggingRegionWhich, setDraggingRegionWhich] = useState<'facecam' | 'main' | null>(null)
  const regionDragRef = useRef<{ which: 'facecam' | 'main'; clientX: number; clientY: number; regionX: number; regionY: number; displayScale: number } | null>(null)

  // Manipulação direta da camada de vídeo — mover (arrastar o corpo) ou dar
  // zoom (arrastar um canto, ao redor do centro do quadro). Cada modo grava
  // seu próprio "estado inicial" no início do arraste pra computar o delta
  // relativo, em vez de valor absoluto (evita "pulos").
  const [draggingLayer, setDraggingLayer] = useState<{ id: string; mode: 'move' | 'scale' } | null>(null)
  const moveStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null)
  const scaleStartRef = useRef<{ distance: number; scale: number } | null>(null)

  // Reseta o erro ao trocar de fonte (ex.: depois de "Aplicar edições", o
  // template-output-editor troca a URL com um ?t= novo pra forçar recarregar).
  useEffect(() => {
    setVideoError('')
  }, [videoSrc])

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

  // As mesmas 3 responsabilidades acima (posição inicial, seek, play/pause),
  // só que pros DOIS vídeos do layout split-screen em vez do vídeo único —
  // ambos tocam/pausam/buscam juntos, sempre sincronizados.
  useEffect(() => {
    if (!splitLayout) return
    // Cada <video> só dispara loadedmetadata uma vez por carregamento —
    // sem precisar de guarda compartilhada, cada um busca seu próprio
    // clipStart quando estiver pronto (os dois, não só o primeiro a avisar).
    const videos = [splitMainVideoRef.current, splitFacecamVideoRef.current].filter((v): v is HTMLVideoElement => !!v)
    const handlers = videos.map((v) => {
      const handler = () => {
        v.currentTime = clipStart
        if (v.videoWidth && v.videoHeight) setSrcSize({ width: v.videoWidth, height: v.videoHeight })
      }
      v.addEventListener('loadedmetadata', handler)
      return { v, handler }
    })
    return () => handlers.forEach(({ v, handler }) => v.removeEventListener('loadedmetadata', handler))
  }, [splitLayout, clipStart])

  useEffect(() => {
    if (!splitLayout || !seekRequest) return
    const time = clipStart + Math.max(0, seekRequest.time)
    ;[splitMainVideoRef.current, splitFacecamVideoRef.current].forEach((v) => { if (v) v.currentTime = time })
  }, [splitLayout, seekRequest, clipStart])

  useEffect(() => {
    if (!splitLayout) return
    ;[splitMainVideoRef.current, splitFacecamVideoRef.current].forEach((v) => {
      if (!v) return
      if (playing) v.play().catch(() => {})
      else v.pause()
    })
  }, [splitLayout, playing])

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

  // Arrastar o CONTEÚDO dentro do painel (facecam ou principal) — desloca a
  // região na direção OPOSTA ao movimento do mouse (arrastar pra direita
  // revela conteúdo mais à esquerda da fonte), igual editor de foto/crop.
  // Largura/altura da região ficam fixas (só os campos numéricos mudam
  // tamanho), mesma decisão de antes: arrastar move, campos redimensionam.
  useEffect(() => {
    if (!draggingRegionWhich || !splitLayout) return

    const handleMove = (clientX: number, clientY: number) => {
      const start = regionDragRef.current
      if (!start || !srcSize.width || !srcSize.height || start.displayScale <= 0) return
      const region = start.which === 'facecam' ? splitLayout.facecamRegion : splitLayout.mainRegion
      const deltaSourceX = -(clientX - start.clientX) / start.displayScale / srcSize.width
      const deltaSourceY = -(clientY - start.clientY) / start.displayScale / srcSize.height
      const x = Math.min(1 - region.width, Math.max(0, start.regionX + deltaSourceX))
      const y = Math.min(1 - region.height, Math.max(0, start.regionY + deltaSourceY))
      if (start.which === 'facecam') onFacecamRegionMove?.(x, y)
      else onMainRegionMove?.(x, y)
    }
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) handleMove(touch.clientX, touch.clientY)
    }
    const stopDragging = () => { setDraggingRegionWhich(null); regionDragRef.current = null }

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
  }, [draggingRegionWhich, splitLayout, srcSize, onFacecamRegionMove, onMainRegionMove])

  // Arrastar/dar zoom na camada de vídeo — mesmo idioma dos dois blocos
  // acima (useState local + listeners globais enquanto o arraste durar).
  useEffect(() => {
    if (!draggingLayer || !onLayerTransformChange) return

    const handleMove = (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      if (draggingLayer.mode === 'move' && moveStartRef.current) {
        const start = moveStartRef.current
        const deltaX = (clientX - start.clientX) / rect.width
        const deltaY = (clientY - start.clientY) / rect.height
        onLayerTransformChange(draggingLayer.id, {
          x: Math.min(1, Math.max(-1, start.x + deltaX)),
          y: Math.min(1, Math.max(-1, start.y + deltaY)),
        })
      } else if (draggingLayer.mode === 'scale' && scaleStartRef.current) {
        const start = scaleStartRef.current
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const currentDistance = Math.hypot(clientX - centerX, clientY - centerY)
        if (currentDistance <= 0 || start.distance <= 0) return
        const newScale = start.scale * (currentDistance / start.distance)
        onLayerTransformChange(draggingLayer.id, { scale: Math.min(4, Math.max(1, newScale)) })
      }
    }
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) handleMove(touch.clientX, touch.clientY)
    }
    const stopDragging = () => {
      setDraggingLayer(null)
      moveStartRef.current = null
      scaleStartRef.current = null
    }

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
  }, [draggingLayer, onLayerTransformChange])

  const videoLayer = layers?.find((l) => l.type === 'VIDEO')

  const startMovingLayer = (clientX: number, clientY: number) => {
    if (!videoLayer) return
    onSelectLayer?.(videoLayer.id)
    moveStartRef.current = { clientX, clientY, x: videoLayer.transform.x, y: videoLayer.transform.y }
    setDraggingLayer({ id: videoLayer.id, mode: 'move' })
  }

  const startScalingLayer = (clientX: number, clientY: number) => {
    if (!videoLayer) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    onSelectLayer?.(videoLayer.id)
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    scaleStartRef.current = { distance: Math.hypot(clientX - centerX, clientY - centerY), scale: videoLayer.transform.scale }
    setDraggingLayer({ id: videoLayer.id, mode: 'scale' })
  }

  // Início do arraste de uma região (facecam ou principal) — grava a
  // "escala de exibição" atual do painel (quanto o vídeo fonte está
  // ampliado dentro dele) pra converter o delta do mouse em fração da
  // fonte durante o arraste (ver useEffect acima).
  const startRegionDrag = (which: 'facecam' | 'main', clientX: number, clientY: number) => {
    if (!splitLayout || !srcSize.width || !srcSize.height) return
    const region = which === 'facecam' ? splitLayout.facecamRegion : splitLayout.mainRegion
    const zoom = which === 'facecam' ? splitLayout.facecamZoom : splitLayout.mainZoom
    const panelSize = which === 'facecam' ? facecamPanelSize : mainPanelSize
    if (!panelSize.width || !panelSize.height) return
    const crop = effectiveCropBox(region, zoom)
    const cropPxW = crop.width * srcSize.width
    const cropPxH = crop.height * srcSize.height
    if (cropPxW <= 0 || cropPxH <= 0) return
    const displayScale = Math.max(panelSize.width / cropPxW, panelSize.height / cropPxH)
    regionDragRef.current = { which, clientX, clientY, regionX: region.x, regionY: region.y, displayScale }
    setDraggingRegionWhich(which)
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

  // Mesma lógica de handleTimeUpdate, só que pro vídeo "condutor" do layout
  // split-screen (o painel principal, que também carrega o áudio) — pausar
  // ele já pausa os dois juntos via o useEffect de `playing` acima.
  const handleSplitMainTimeUpdate = () => {
    const video = splitMainVideoRef.current
    if (!video) return
    if (video.currentTime >= clipEnd) {
      onPlayingChange(false)
      onTimeUpdate(clipEnd - clipStart)
      return
    }
    onTimeUpdate(Math.max(0, video.currentTime - clipStart))
  }

  // O <video> não expõe o corpo da resposta HTTP — refaz a mesma requisição
  // só pra ler a mensagem de erro real da API (ex.: "Vídeo não encontrado")
  // em vez de deixar tela preta sem explicação. Compartilhado entre o vídeo
  // único e os dois painéis do layout split-screen (mesma fonte, mesmo erro
  // possível nos dois casos).
  const reportVideoError = async () => {
    try {
      const res = await fetch(videoSrc)
      const body = await res.json().catch(() => null)
      setVideoError(body?.error || `Não foi possível carregar o vídeo (HTTP ${res.status}).`)
    } catch {
      setVideoError('Não foi possível carregar o vídeo. Verifique sua conexão e tente recarregar a página.')
    }
  }

  const visibleOverlays = overlays.filter((o) => currentTime >= o.startTime && currentTime <= o.endTime)
  const activeWord = captions.flatMap((s) => s.words).find((w) => currentTime >= w.start && currentTime <= w.end)

  // A camada VIDEO (sistema novo) tem prioridade sobre o `transform` legado
  // pro preview — mesma precedência do render em ffmpeg.ts.
  const previewTransform: VideoTransform | undefined = videoLayer
    ? { zoom: videoLayer.transform.scale, positionX: videoLayer.transform.x, positionY: videoLayer.transform.y }
    : transform
  const layerSelected = !!videoLayer && selectedLayerId === videoLayer.id

  return (
    // Wrapper só pra moldura (gradiente sutil + sombra) — containerRef fica
    // no elemento de dentro, sem padding/borda, pra não desalinhar a
    // matemática de coordenadas do arraste (getBoundingClientRect).
    <div className="mx-auto rounded-2xl bg-gradient-to-b from-white/10 to-white/0 p-px shadow-2xl shadow-black/40" style={{ maxHeight: 642 }}>
      <div
        ref={containerRef}
        className="relative w-full bg-black rounded-2xl overflow-hidden"
        style={{ aspectRatio, maxHeight: 640 }}
      >
      {splitLayout ? (
        // Layout split-screen: os dois painéis já compostos de verdade,
        // cada um arrastável independentemente — sem linha divisória
        // (a borda entre os dois <div> já delimita visualmente, sem
        // precisar de um traço por cima) e sem round-trip no servidor pra
        // ver o resultado (tudo calculado no cliente, atualiza na hora).
        <div className="absolute inset-0 flex flex-col">
          {(splitLayout.mode === 'FACECAM_TOP_MAIN_BOTTOM' ? (['facecam', 'main'] as const) : (['main', 'facecam'] as const)).map((which) => {
            const isFacecam = which === 'facecam'
            const region = isFacecam ? splitLayout.facecamRegion : splitLayout.mainRegion
            const zoom = isFacecam ? splitLayout.facecamZoom : splitLayout.mainZoom
            const isTop = (which === 'facecam') === (splitLayout.mode === 'FACECAM_TOP_MAIN_BOTTOM')
            const heightPercent = (isTop ? splitLayout.splitRatio : 1 - splitLayout.splitRatio) * 100
            return (
              <SplitPanel
                key={which}
                videoRef={isFacecam ? splitFacecamVideoRef : splitMainVideoRef}
                videoSrc={videoSrc}
                heightPercent={heightPercent}
                crop={effectiveCropBox(region, zoom)}
                srcSize={srcSize}
                panelSize={isFacecam ? facecamPanelSize : mainPanelSize}
                label={isFacecam ? 'Facecam' : 'Vídeo principal'}
                muted={isFacecam}
                draggable={!!(isFacecam ? onFacecamRegionMove : onMainRegionMove)}
                dragging={draggingRegionWhich === which}
                onDragStart={(x, y) => startRegionDrag(which, x, y)}
                onPanelResize={isFacecam ? setFacecamPanelSize : setMainPanelSize}
                onTimeUpdate={isFacecam ? undefined : handleSplitMainTimeUpdate}
                onError={reportVideoError}
              />
            )
          })}
        </div>
      ) : (
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full h-full object-contain bg-black"
          style={
            previewTransform
              ? { transform: `scale(${previewTransform.zoom}) translate(${previewTransform.positionX * (previewTransform.zoom - 1) * 50}%, ${previewTransform.positionY * (previewTransform.zoom - 1) * 50}%)` }
              : undefined
          }
          onTimeUpdate={handleTimeUpdate}
          onError={reportVideoError}
          playsInline
        />
      )}

      {!splitLayout && videoLayer && onLayerTransformChange && (
        <TransformBox
          selected={layerSelected}
          onSelect={() => onSelectLayer?.(videoLayer.id)}
          onStartMove={startMovingLayer}
          onStartScale={startScalingLayer}
        />
      )}

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

      {videoError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center z-20">
          <p className="text-sm font-medium text-red-400">Vídeo não carregou</p>
          <p className="text-xs text-white/50">{videoError}</p>
        </div>
      ) : !playing && !(videoLayer && onLayerTransformChange) && !splitLayout && (
        // Só mostra o botão de play gigante cobrindo a tela toda quando NÃO
        // existe uma camada de vídeo selecionável nem layout split-screen
        // ativo (senão ele bloquearia o clique de seleção/arraste dos
        // painéis, que também cobrem a área inteira). Com camada/layout, dá
        // pra tocar/pausar pelo botão da barra de transporte embaixo do preview.
        <button
          onClick={() => onPlayingChange(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="Reproduzir"
        >
          <div className="w-16 h-16 rounded-full bg-white/95 shadow-brand-lg flex items-center justify-center transition-transform hover:scale-105">
            <div className="w-0 h-0 border-y-[11px] border-y-transparent border-l-[18px] border-l-black ml-1" />
          </div>
        </button>
      )}
      </div>
    </div>
  )
}
