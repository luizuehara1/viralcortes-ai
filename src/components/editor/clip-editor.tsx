'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Type, Captions, Wand2, LayoutTemplate, Move3d } from 'lucide-react'
import { VideoPreviewPlayer } from './video-preview-player'
import { TimelineScrubber } from './timeline-scrubber'
import { TextOverlaysPanel } from './text-overlays-panel'
import { EffectsPanel } from './effects-panel'
import { CaptionsPanel } from './captions-panel'
import { LayoutPanel } from './layout-panel'
import { TransformPanel } from './transform-panel'
import { FormatPickerModal } from '@/components/clips/format-picker-modal'
import { Button } from '@/components/ui/button'
import { TabButton } from '@/components/ui/tab-button'
import type { EditorState, ClipFormat, FitMode, SplitLayoutMode, SplitLayoutConfig } from '@/types'
import { DEFAULT_SPLIT_LAYOUT_CONFIG, DEFAULT_SPLIT_RATIO_BY_MODE } from '@/types'

interface Props {
  clip: { id: string; title: string; startTime: number; endTime: number }
  sourceVideoId: string
  projectId: string
  initialEditorState: EditorState
  lastSplitLayoutConfig: SplitLayoutConfig | null
}

type Tab = 'captions' | 'text' | 'effects' | 'layout' | 'transform'

// Orquestra o editor inteiro: preview + autosave do editorState + disparo do
// render (que já pega os overlays/legendas/efeitos automaticamente no
// worker, ver src/workers/clip-renderer.ts). Não re-corta o clipe — o
// intervalo [startTime, endTime] já foi decidido na sugestão de IA.
export function ClipEditor({ clip, sourceVideoId, projectId, initialEditorState, lastSplitLayoutConfig }: Props) {
  const router = useRouter()
  const duration = clip.endTime - clip.startTime

  const [editorState, setEditorState] = useState<EditorState>(initialEditorState)
  const [tab, setTab] = useState<Tab>('captions')
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [seekRequest, setSeekRequest] = useState<{ time: number; token: number } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rendering, setRendering] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const seekTokenRef = useRef(0)
  const isFirstRender = useRef(true)

  // Autosave com debounce — evita 1 request por tecla digitada/slider
  // arrastado. Pula a primeira montagem (não precisa salvar o que acabou de
  // ser carregado do servidor).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clips/${clip.id}/editor`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editorState),
        })
        setSaveState(res.ok ? 'saved' : 'idle')
      } catch {
        setSaveState('idle')
      }
    }, 800)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorState, clip.id])

  const seekTo = useCallback((time: number) => {
    seekTokenRef.current += 1
    setSeekRequest({ time, token: seekTokenRef.current })
  }, [])

  const requestRender = async (format: ClipFormat, fitMode: FitMode, layoutMode?: SplitLayoutMode | null) => {
    setRendering(true)
    try {
      // Layout escolhido no modal (na hora de gerar, antes de já ter mexido
      // na aba "Layout") — só grava um padrão se o clipe ainda não tiver um
      // layoutConfig próprio, pra não sobrescrever um ajuste já feito. Se
      // não há ajuste salvo do usuário (lastSplitLayoutConfig), tenta
      // detectar a facecam de verdade em vez de já cair no palpite padrão.
      if (layoutMode && !editorState.layoutConfig) {
        let layoutConfig = { ...(lastSplitLayoutConfig ?? DEFAULT_SPLIT_LAYOUT_CONFIG), splitRatio: DEFAULT_SPLIT_RATIO_BY_MODE[layoutMode] }
        if (!lastSplitLayoutConfig) {
          try {
            const detectRes = await fetch(`/api/clips/${clip.id}/detect-facecam`, { method: 'POST' })
            const detectBody = await detectRes.json().catch(() => null)
            if (detectRes.ok && detectBody?.detected && detectBody.region) {
              layoutConfig = { ...layoutConfig, facecamRegion: detectBody.region, facecamConfirmed: true }
            } else {
              layoutConfig = { ...layoutConfig, facecamConfirmed: false }
            }
          } catch {
            layoutConfig = { ...layoutConfig, facecamConfirmed: false }
          }
        }
        await fetch(`/api/clips/${clip.id}/editor`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layoutMode, layoutConfig }),
        })
        setEditorState((s) => ({ ...s, layoutMode, layoutConfig }))
      }
      const res = await fetch(`/api/clips/${clip.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, fitMode }),
      })
      if (res.ok) {
        router.push(`/projects/${projectId}`)
        return
      }
    } catch {
      // segue para reabilitar o botão abaixo
    }
    setRendering(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="p-2 rounded-lg glass hover:bg-white/8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">{clip.title}</h1>
            <p className="text-xs text-white/40">Editor de vídeo · {duration.toFixed(0)}s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30 w-14 flex items-center gap-1">
            {saveState === 'saving' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            {saveState === 'saved' && <span className="w-1.5 h-1.5 rounded-full bg-neon-500" />}
            {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? 'Salvo' : ''}
          </span>
          <Button onClick={() => setPickerOpen(true)} icon={<Sparkles className="w-4 h-4" />}>
            Gerar corte com essas edições
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="space-y-3">
          <VideoPreviewPlayer
            videoSrc={`/api/videos/${sourceVideoId}/stream`}
            clipStart={clip.startTime}
            clipEnd={clip.endTime}
            playing={playing}
            onPlayingChange={setPlaying}
            seekRequest={seekRequest}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            overlays={editorState.textOverlays}
            captions={editorState.captions}
            captionStyle={editorState.captionStyle}
            onOverlayMove={(id, x, y) =>
              setEditorState((s) => ({
                ...s,
                textOverlays: s.textOverlays.map((o) => (o.id === id ? { ...o, x, y } : o)),
              }))
            }
            splitLayout={
              editorState.layoutMode && editorState.layoutConfig
                ? { region: editorState.layoutConfig.facecamRegion, splitRatio: editorState.layoutConfig.splitRatio, mode: editorState.layoutMode }
                : undefined
            }
            onSplitLayoutRegionMove={(x, y) =>
              setEditorState((s) =>
                s.layoutConfig ? { ...s, layoutConfig: { ...s.layoutConfig, facecamRegion: { ...s.layoutConfig.facecamRegion, x, y }, facecamConfirmed: true } } : s
              )
            }
            transform={editorState.transform}
          />
          <div className="glass rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-white/40">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                {playing ? 'Pausar' : 'Reproduzir'}
              </button>
              <span>
                {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>
            <TimelineScrubber duration={duration} currentTime={currentTime} onSeek={seekTo} />
          </div>
        </div>

        <div className="glass rounded-2xl p-4 space-y-4 h-fit">
          <div className="flex gap-1.5 p-1 rounded-xl bg-white/5">
            <TabButton active={tab === 'captions'} onClick={() => setTab('captions')} icon={<Captions className="w-3.5 h-3.5" />} label="Legendas" />
            <TabButton active={tab === 'text'} onClick={() => setTab('text')} icon={<Type className="w-3.5 h-3.5" />} label="Texto" />
            <TabButton active={tab === 'effects'} onClick={() => setTab('effects')} icon={<Wand2 className="w-3.5 h-3.5" />} label="Efeitos" />
            <TabButton active={tab === 'layout'} onClick={() => setTab('layout')} icon={<LayoutTemplate className="w-3.5 h-3.5" />} label="Layout" />
            <TabButton active={tab === 'transform'} onClick={() => setTab('transform')} icon={<Move3d className="w-3.5 h-3.5" />} label="Transformar" />
          </div>

          {tab === 'captions' && (
            <CaptionsPanel
              captionsEndpoint={`/api/clips/${clip.id}/captions`}
              captions={editorState.captions}
              captionStyle={editorState.captionStyle}
              captionsGeneratedAt={editorState.captionsGeneratedAt}
              onCaptionsGenerated={(captions) =>
                setEditorState((s) => ({ ...s, captions, captionsGeneratedAt: new Date().toISOString() }))
              }
              onStyleChange={(captionStyle) => setEditorState((s) => ({ ...s, captionStyle }))}
              onEditSegment={(id, text) =>
                setEditorState((s) => ({
                  ...s,
                  captions: s.captions.map((c) => (c.id === id ? { ...c, editedText: text } : c)),
                }))
              }
            />
          )}
          {tab === 'text' && (
            <TextOverlaysPanel
              overlays={editorState.textOverlays}
              duration={duration}
              currentTime={currentTime}
              onChange={(textOverlays) => setEditorState((s) => ({ ...s, textOverlays }))}
            />
          )}
          {tab === 'effects' && (
            <EffectsPanel
              effects={editorState.effects}
              duration={duration}
              currentTime={currentTime}
              onChange={(effects) => setEditorState((s) => ({ ...s, effects }))}
            />
          )}
          {tab === 'layout' && (
            <LayoutPanel
              layoutMode={editorState.layoutMode}
              layoutConfig={editorState.layoutConfig}
              lastUsedConfig={lastSplitLayoutConfig}
              detectEndpoint={`/api/clips/${clip.id}/detect-facecam`}
              previewEndpoint={`/api/clips/${clip.id}/facecam-preview`}
              onChange={(layoutMode, layoutConfig) => setEditorState((s) => ({ ...s, layoutMode, layoutConfig }))}
            />
          )}
          {tab === 'transform' && (
            <TransformPanel
              transform={editorState.transform}
              onChange={(transform) => setEditorState((s) => ({ ...s, transform }))}
            />
          )}
        </div>
      </div>

      {pickerOpen && (
        <FormatPickerModal submitting={rendering} onClose={() => setPickerOpen(false)} onConfirm={requestRender} />
      )}
    </div>
  )
}
