'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Type, Captions, Wand2, Instagram, Youtube, LayoutTemplate } from 'lucide-react'
import { VideoPreviewPlayer } from './video-preview-player'
import { TimelineScrubber } from './timeline-scrubber'
import { TextOverlaysPanel } from './text-overlays-panel'
import { EffectsPanel } from './effects-panel'
import { CaptionsPanel } from './captions-panel'
import { LayoutPanel } from './layout-panel'
import { ScheduleModal } from '@/components/social/schedule-modal'
import { Button } from '@/components/ui/button'
import { TabButton } from '@/components/ui/tab-button'
import type { EditorState, SplitLayoutConfig } from '@/types'

interface Props {
  output: { id: string; duration: number; caption: string | null }
  initialEditorState: EditorState
  lastSplitLayoutConfig: SplitLayoutConfig | null
}

type Tab = 'captions' | 'text' | 'effects' | 'layout'

// Editor do resultado do Template Studio — mesma UI/lógica do ClipEditor
// (src/components/editor/clip-editor.tsx), mas sem sourceVideoId/projectId/
// janela de clipe: o TemplateOutput já É o arquivo inteiro (0 até duration).
// Diferente de um clipe, não há múltiplos formatos pra escolher ao "renderizar"
// — o botão só queima as edições de volta no próprio arquivo
// (POST /api/template-outputs/[id]/render).
export function TemplateOutputEditor({ output, initialEditorState, lastSplitLayoutConfig }: Props) {
  const duration = output.duration

  const [editorState, setEditorState] = useState<EditorState>(initialEditorState)
  const [tab, setTab] = useState<Tab>('captions')
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [seekRequest, setSeekRequest] = useState<{ time: number; token: number } | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [schedulePlatform, setSchedulePlatform] = useState<'INSTAGRAM_REELS' | 'YOUTUBE_SHORTS' | null>(null)
  const [appliedAt, setAppliedAt] = useState<number | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const seekTokenRef = useRef(0)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/template-outputs/${output.id}/editor`, {
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
  }, [editorState, output.id])

  const seekTo = useCallback((time: number) => {
    seekTokenRef.current += 1
    setSeekRequest({ time, token: seekTokenRef.current })
  }, [])

  const applyEdits = async () => {
    setRendering(true)
    setRenderError('')
    try {
      const res = await fetch(`/api/template-outputs/${output.id}/render`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setRenderError(body?.error || 'Falha ao aplicar as edições')
        setRendering(false)
        return
      }
      // Fica na mesma tela em vez de voltar pro Template Studio — o
      // Template Studio não guarda uma lista dos resultados anteriores, só
      // o que acabou de gerar na sessão atual, então navegar pra lá fazia o
      // vídeo recém-editado "sumir" (inacessível) antes do usuário conseguir
      // baixar ou agendar. appliedAt força o player a recarregar o arquivo
      // novo (a URL do stream não muda, o navegador cacheava a versão antiga).
      setAppliedAt(Date.now())
      setRendering(false)
    } catch {
      setRenderError('Falha na conexão')
      setRendering(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/template-studio" className="p-2 rounded-lg glass hover:bg-white/8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Editar resultado do template</h1>
            <p className="text-xs text-white/40">Editor de vídeo · {duration.toFixed(0)}s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30 w-14">
            {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? 'Salvo' : ''}
          </span>
          <Button onClick={() => setSchedulePlatform('INSTAGRAM_REELS')} variant="secondary" icon={<Instagram className="w-4 h-4" />}>
            Instagram
          </Button>
          <Button onClick={() => setSchedulePlatform('YOUTUBE_SHORTS')} variant="secondary" icon={<Youtube className="w-4 h-4" />}>
            YouTube
          </Button>
          <Button onClick={applyEdits} loading={rendering} icon={<Sparkles className="w-4 h-4" />}>
            {rendering ? 'Aplicando...' : 'Aplicar edições'}
          </Button>
        </div>
      </div>

      {renderError && <p className="text-sm text-red-400">{renderError}</p>}
      {appliedAt && !renderError && (
        <div className="flex items-center gap-3 text-sm text-emerald-400 bg-emerald-500/10 rounded-xl px-4 py-2.5">
          <span>Edições aplicadas! Baixe ou agende quando quiser.</span>
          <a
            href={`/api/template-outputs/${output.id}/stream`}
            download
            className="underline hover:text-emerald-300"
          >
            Baixar vídeo
          </a>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="space-y-3">
          <VideoPreviewPlayer
            videoSrc={`/api/template-outputs/${output.id}/stream${appliedAt ? `?t=${appliedAt}` : ''}`}
            clipStart={0}
            clipEnd={duration}
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
                s.layoutConfig ? { ...s, layoutConfig: { ...s.layoutConfig, facecamRegion: { ...s.layoutConfig.facecamRegion, x, y } } } : s
              )
            }
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
          </div>

          {tab === 'captions' && (
            <CaptionsPanel
              captionsEndpoint={`/api/template-outputs/${output.id}/captions`}
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
              detectEndpoint={`/api/template-outputs/${output.id}/detect-facecam`}
              onChange={(layoutMode, layoutConfig) => setEditorState((s) => ({ ...s, layoutMode, layoutConfig }))}
            />
          )}
        </div>
      </div>

      {schedulePlatform && (
        <ScheduleModal
          sourceType="TEMPLATE_OUTPUT"
          sourceId={output.id}
          defaultPlatform={schedulePlatform}
          defaultCaption={output.caption || ''}
          downloadUrl={`/api/template-outputs/${output.id}/stream`}
          onClose={() => setSchedulePlatform(null)}
        />
      )}
    </div>
  )
}
