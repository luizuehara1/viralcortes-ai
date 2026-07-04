'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Type, Captions, Wand2, Instagram, Youtube, LayoutTemplate, Move3d } from 'lucide-react'
import { VideoEditorCanvas } from './video-editor-canvas'
import { TextOverlaysPanel } from './text-overlays-panel'
import { EffectsPanel } from './effects-panel'
import { CaptionsPanel } from './captions-panel'
import { LayoutPanel } from './layout-panel'
import { PropertiesPanel } from './properties-panel'
import { EditorToolRail } from './editor-tool-rail'
import { CanvasFormatSelector } from './canvas-format-selector'
import { ScheduleModal } from '@/components/social/schedule-modal'
import { Button } from '@/components/ui/button'
import type { EditorState, SplitLayoutConfig, EditorLayer } from '@/types'
import { DEFAULT_EDITOR_CANVAS } from '@/types'

interface Props {
  output: { id: string; duration: number; caption: string | null }
  initialEditorState: EditorState
  lastSplitLayoutConfig: SplitLayoutConfig | null
}

type Tab = 'captions' | 'text' | 'effects' | 'layout' | 'transform'

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
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(initialEditorState.layers?.[0]?.id ?? null)

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

  const updateLayerTransform = (id: string, patch: Partial<EditorLayer['transform']>) =>
    setEditorState((s) => ({
      ...s,
      layers: (s.layers ?? []).map((l) => (l.id === id ? { ...l, transform: { ...l.transform, ...patch } } : l)),
    }))

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
            <h1 className="text-lg font-bold leading-tight">Editor de vídeo</h1>
            <p className="text-xs text-white/40">Edite camadas, cortes, legendas, efeitos e exporte seu corte · {duration.toFixed(0)}s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CanvasFormatSelector canvas={editorState.canvas} onChange={(canvas) => setEditorState((s) => ({ ...s, canvas }))} />
          <span className="text-xs text-white/30 w-14">
            {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? 'Salvo' : ''}
          </span>
          <Button onClick={() => setSchedulePlatform('INSTAGRAM_REELS')} variant="secondary" icon={<Instagram className="w-4 h-4" />}>
            Agendar Instagram
          </Button>
          <Button onClick={() => setSchedulePlatform('YOUTUBE_SHORTS')} variant="secondary" icon={<Youtube className="w-4 h-4" />}>
            Agendar YouTube
          </Button>
          <Button onClick={applyEdits} loading={rendering} icon={<Sparkles className="w-4 h-4" />}>
            {rendering ? 'Renderizando...' : 'Renderizar'}
          </Button>
        </div>
      </div>

      {renderError && <p className="text-sm text-red-400">{renderError}</p>}
      {appliedAt && !renderError && (
        <div className="flex items-center gap-3 text-sm text-emerald-400 bg-emerald-500/10 rounded-xl px-4 py-2.5">
          <span>Renderizado! Exporte ou agende quando quiser.</span>
          <a
            href={`/api/template-outputs/${output.id}/stream`}
            download
            className="underline hover:text-emerald-300"
          >
            Exportar (baixar)
          </a>
        </div>
      )}

      <div className="grid lg:grid-cols-[68px_minmax(0,1fr)_360px] gap-4">
        <EditorToolRail
          active={tab}
          onSelect={(id) => setTab(id as Tab)}
          tools={[
            { id: 'captions', icon: <Captions className="w-4 h-4" />, label: 'Legendas' },
            { id: 'text', icon: <Type className="w-4 h-4" />, label: 'Texto' },
            { id: 'effects', icon: <Wand2 className="w-4 h-4" />, label: 'Efeitos' },
            { id: 'layout', icon: <LayoutTemplate className="w-4 h-4" />, label: 'Layout' },
            { id: 'transform', icon: <Move3d className="w-4 h-4" />, label: 'Transf.' },
          ]}
        />

        <VideoEditorCanvas
          duration={duration}
          onSeek={seekTo}
          aspectRatio={
            editorState.canvas && editorState.canvas.width > 0 && editorState.canvas.height > 0
              ? `${editorState.canvas.width} / ${editorState.canvas.height}`
              : `${DEFAULT_EDITOR_CANVAS.width} / ${DEFAULT_EDITOR_CANVAS.height}`
          }
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
              s.layoutConfig ? { ...s, layoutConfig: { ...s.layoutConfig, facecamRegion: { ...s.layoutConfig.facecamRegion, x, y }, facecamConfirmed: true } } : s
            )
          }
          transform={editorState.transform}
          layers={editorState.layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          onLayerTransformChange={updateLayerTransform}
          onLayersChange={(layers) => setEditorState((s) => ({ ...s, layers }))}
        />

        <div className="glass rounded-2xl p-4 space-y-4 h-fit">
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
              previewEndpoint={`/api/template-outputs/${output.id}/facecam-preview`}
              layoutPreviewEndpoint={`/api/template-outputs/${output.id}/preview-layout`}
              onChange={(layoutMode, layoutConfig) => setEditorState((s) => ({ ...s, layoutMode, layoutConfig }))}
            />
          )}
          {tab === 'transform' && (
            <PropertiesPanel
              layer={editorState.layers?.find((l) => l.id === selectedLayerId) ?? editorState.layers?.[0]}
              onChange={(patch) => {
                const layer = editorState.layers?.find((l) => l.id === selectedLayerId) ?? editorState.layers?.[0]
                if (layer) updateLayerTransform(layer.id, patch)
              }}
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
