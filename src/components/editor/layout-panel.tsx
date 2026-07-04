'use client'

import { useState } from 'react'
import { Loader2, Sparkles, AlertTriangle, Eye } from 'lucide-react'
import {
  SPLIT_LAYOUT_LABELS, DEFAULT_SPLIT_LAYOUT_CONFIG, DEFAULT_SPLIT_RATIO_BY_MODE, FULL_FRAME_REGION,
  type SplitLayoutMode, type SplitLayoutConfig, type SplitLayoutRegion,
} from '@/types'

interface Props {
  layoutMode: SplitLayoutMode | null | undefined
  layoutConfig: SplitLayoutConfig | undefined
  detectEndpoint: string
  // "Testar recorte da facecam" — extrai um frame real já cropado pela
  // região atual, pra conferir visualmente ANTES de renderizar o vídeo
  // inteiro (achou um caso real onde a detecção automática errou a região
  // e só se percebia depois do render inteiro terminar).
  previewEndpoint: string
  // "Ver layout completo" — mostra os DOIS painéis (facecam + principal)
  // já compostos de verdade (mesmo filtro do render final, não uma
  // aproximação) — antes só existia o preview isolado da facecam, então
  // detectar/ajustar nunca mostrava o resultado final real no editor.
  layoutPreviewEndpoint: string
  onChange: (layoutMode: SplitLayoutMode | null, layoutConfig: SplitLayoutConfig | undefined) => void
  // Último ajuste salvo do usuário (User.lastSplitLayoutConfig) — usado como
  // ponto de partida ao escolher um layout pela primeira vez neste clipe,
  // em vez do padrão fixo (canto inferior direito).
  lastUsedConfig?: SplitLayoutConfig | null
}

const MODES: SplitLayoutMode[] = ['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']

export function LayoutPanel({ layoutMode, layoutConfig, detectEndpoint, previewEndpoint, layoutPreviewEndpoint, onChange, lastUsedConfig }: Props) {
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [layoutPreviewing, setLayoutPreviewing] = useState(false)
  const [layoutPreviewError, setLayoutPreviewError] = useState('')
  const [layoutPreviewUrl, setLayoutPreviewUrl] = useState('')

  const config = layoutConfig ?? lastUsedConfig ?? DEFAULT_SPLIT_LAYOUT_CONFIG

  // Gera o preview do layout completo (os dois painéis já compostos) — chamado
  // automaticamente depois de uma detecção (manual ou automática ao escolher
  // o modo) bem-sucedida, além de poder ser clicado a qualquer momento.
  const refreshLayoutPreview = async (mode: SplitLayoutMode, cfg: SplitLayoutConfig) => {
    setLayoutPreviewing(true)
    setLayoutPreviewError('')
    try {
      const res = await fetch(layoutPreviewEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutMode: mode, layoutConfig: cfg }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao gerar o preview do layout')
      setLayoutPreviewUrl(body.previewDataUrl)
    } catch (err: any) {
      setLayoutPreviewError(err.message || 'Falha ao gerar o preview do layout')
    } finally {
      setLayoutPreviewing(false)
    }
  }

  // Escolher um modo pela primeira vez (sem layoutConfig ainda) já tenta
  // detectar a facecam de verdade — antes isso só acontecia se o usuário
  // escolhesse o layout pelo modal de "gerar corte"; escolhendo direto aqui
  // (único jeito de configurar layout num resultado de Template Studio,
  // que não passa pelo modal) a facecam ficava sempre na posição padrão,
  // sem aviso nenhum (bug real encontrado num TemplateOutput de teste).
  const selectMode = async (mode: SplitLayoutMode | null) => {
    if (mode === null) {
      onChange(null, layoutConfig)
      return
    }
    if (layoutConfig) {
      onChange(mode, layoutConfig)
      return
    }
    const base = { ...(lastUsedConfig ?? DEFAULT_SPLIT_LAYOUT_CONFIG), splitRatio: DEFAULT_SPLIT_RATIO_BY_MODE[mode] }
    if (lastUsedConfig) {
      // já tem um ajuste salvo do usuário — reaproveita em vez de detectar de novo.
      const confirmedCfg = { ...base, facecamConfirmed: true }
      onChange(mode, confirmedCfg)
      refreshLayoutPreview(mode, confirmedCfg)
      return
    }
    onChange(mode, base)
    setDetecting(true)
    setDetectError('')
    try {
      const res = await fetch(detectEndpoint, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.detected && body.region) {
        const detectedCfg = { ...base, facecamRegion: body.region, facecamConfirmed: true }
        onChange(mode, detectedCfg)
        // Mostra o resultado real já composto assim que detecta — é
        // exatamente o pedido de "ao clicar detectar, o vídeo já deve
        // mudar pro formato final", em vez de só atualizar dados sem
        // nenhuma confirmação visual do resultado.
        refreshLayoutPreview(mode, detectedCfg)
      } else {
        setDetectError('Facecam não detectada automaticamente. Ajuste manualmente a área.')
        const fallbackCfg = { ...base, facecamConfirmed: false }
        onChange(mode, fallbackCfg)
        // Mostra o resultado (provavelmente errado) mesmo no fallback —
        // ajuda o usuário a VER que precisa ajustar, não só ler um aviso.
        refreshLayoutPreview(mode, fallbackCfg)
      }
    } catch {
      onChange(mode, { ...base, facecamConfirmed: false })
    } finally {
      setDetecting(false)
    }
  }

  // Qualquer edição manual (arrastar, digitar nos campos, mexer no zoom) já
  // conta como "confirmado" — o usuário assumiu o controle da posição, não
  // faz mais sentido mostrar o aviso de "isso é só um palpite padrão".
  const updateConfig = (patch: Partial<SplitLayoutConfig>) => {
    if (!layoutMode) return
    onChange(layoutMode, { ...config, facecamConfirmed: true, ...patch })
  }

  const updateRegion = (patch: Partial<SplitLayoutConfig['facecamRegion']>) => {
    updateConfig({ facecamRegion: { ...config.facecamRegion, ...patch } })
  }

  // Ausente = configs salvas antes do vídeo principal ficar ajustável
  // (frame inteiro, sem zoom — mesmo fallback usado no render).
  const mainRegion: SplitLayoutRegion = config.mainRegion ?? FULL_FRAME_REGION
  const mainZoom = config.mainZoom ?? 1

  const updateMainRegion = (patch: Partial<SplitLayoutRegion>) => {
    updateConfig({ mainRegion: { ...mainRegion, ...patch } })
  }

  const detectAutomatically = async () => {
    setDetecting(true)
    setDetectError('')
    try {
      const res = await fetch(detectEndpoint, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao detectar a facecam')
      if (!body.detected) {
        setDetectError('Facecam não detectada automaticamente. Ajuste manualmente a área.')
        if (layoutMode) {
          const fallbackCfg = { ...config, facecamConfirmed: false }
          onChange(layoutMode, fallbackCfg)
          refreshLayoutPreview(layoutMode, fallbackCfg)
        }
        return
      }
      if (layoutMode) {
        const detectedCfg = { ...config, facecamRegion: body.region, facecamConfirmed: true }
        onChange(layoutMode, detectedCfg)
        refreshLayoutPreview(layoutMode, detectedCfg)
      }
    } catch (err: any) {
      setDetectError(err.message || 'Falha ao detectar a facecam')
    } finally {
      setDetecting(false)
    }
  }

  const testFacecamCrop = async () => {
    setPreviewing(true)
    setPreviewError('')
    setPreviewUrl('')
    try {
      const res = await fetch(previewEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.facecamRegion),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao gerar o preview')
      setPreviewUrl(body.previewDataUrl)
    } catch (err: any) {
      setPreviewError(err.message || 'Falha ao gerar o preview')
    } finally {
      setPreviewing(false)
    }
  }

  // Trata "nunca confirmado" (undefined — registros antigos de antes desse
  // campo existir, ou o próprio instante logo após escolher o modo) igual a
  // "detecção falhou" (false) — comparar só com `=== false` deixava
  // registros antigos sem aviso nenhum, mesmo usando a posição padrão.
  const showFallbackWarning = !!layoutMode && !layoutConfig?.facecamConfirmed

  const pct = (n: number) => Math.round(n * 100)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => selectMode(null)}
          className={`py-2.5 px-3 rounded-xl border text-sm font-medium text-left transition-colors ${
            !layoutMode ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3 hover:bg-white/6 text-white/60'
          }`}
        >
          Nenhum (layout normal)
        </button>
        {MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => selectMode(mode)}
            className={`py-2.5 px-3 rounded-xl border text-sm font-medium text-left transition-colors ${
              layoutMode === mode ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3 hover:bg-white/6 text-white/60'
            }`}
          >
            {SPLIT_LAYOUT_LABELS[mode]}
          </button>
        ))}
      </div>

      {layoutMode && (
        <div className="space-y-3 pt-1">
          {showFallbackWarning && !detectError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Facecam não detectada automaticamente. Ajuste manualmente a área abaixo (ou tente detectar de novo).</span>
            </div>
          )}
          <button
            onClick={detectAutomatically}
            disabled={detecting}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {detecting ? 'Detectando...' : 'Detectar automaticamente'}
          </button>
          {detectError && <p className="text-xs text-amber-400">{detectError}</p>}

          <div className="space-y-1.5">
            <button
              onClick={() => layoutMode && refreshLayoutPreview(layoutMode, config)}
              disabled={layoutPreviewing || !layoutMode}
              className="w-full py-2.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 disabled:opacity-50 text-sm font-medium text-violet-200 transition-all flex items-center justify-center gap-2"
            >
              {layoutPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {layoutPreviewing ? 'Montando layout...' : 'Ver layout completo'}
            </button>
            {layoutPreviewError && <p className="text-xs text-red-400">{layoutPreviewError}</p>}
            {layoutPreviewUrl && (
              <div className="space-y-1">
                <p className="text-xs text-white/40">Resultado real (mesmo filtro do render final, 1080x1920):</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={layoutPreviewUrl} alt="Preview do layout completo" className="w-full max-w-[220px] mx-auto rounded-lg border border-white/10" />
              </div>
            )}
          </div>

          <p className="text-xs text-white/30">Arraste a facecam no preview (painel de cima ou de baixo, o menor dos dois) pra reposicionar, ou ajuste os campos abaixo.</p>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="text-xs text-white/40">
              X (%)
              <input
                type="number" min={0} max={100}
                value={pct(config.facecamRegion.x)}
                onChange={(e) => updateRegion({ x: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              />
            </label>
            <label className="text-xs text-white/40">
              Y (%)
              <input
                type="number" min={0} max={100}
                value={pct(config.facecamRegion.y)}
                onChange={(e) => updateRegion({ y: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              />
            </label>
            <label className="text-xs text-white/40">
              Largura (%)
              <input
                type="number" min={2} max={100}
                value={pct(config.facecamRegion.width)}
                onChange={(e) => updateRegion({ width: Math.min(1, Math.max(0.02, Number(e.target.value) / 100)) })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              />
            </label>
            <label className="text-xs text-white/40">
              Altura (%)
              <input
                type="number" min={2} max={100}
                value={pct(config.facecamRegion.height)}
                onChange={(e) => updateRegion({ height: Math.min(1, Math.max(0.02, Number(e.target.value) / 100)) })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
              />
            </label>
          </div>

          <SliderRow
            label="Zoom da facecam"
            value={config.facecamZoom}
            min={1} max={3} step={0.05}
            onChange={(v) => updateConfig({ facecamZoom: v })}
          />
          <SliderRow
            label="Divisão dos painéis"
            value={config.splitRatio}
            min={0.3} max={0.7} step={0.01}
            onChange={(v) => updateConfig({ splitRatio: v })}
          />

          <div className="pt-2 border-t border-white/10 space-y-2.5">
            <p className="text-xs font-medium text-white/60">Vídeo principal</p>
            <p className="text-xs text-white/30">Arraste o vídeo de baixo no preview pra reposicionar, ou ajuste os campos abaixo.</p>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-xs text-white/40">
                X (%)
                <input
                  type="number" min={0} max={100}
                  value={pct(mainRegion.x)}
                  onChange={(e) => updateMainRegion({ x: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
              <label className="text-xs text-white/40">
                Y (%)
                <input
                  type="number" min={0} max={100}
                  value={pct(mainRegion.y)}
                  onChange={(e) => updateMainRegion({ y: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
              <label className="text-xs text-white/40">
                Largura (%)
                <input
                  type="number" min={2} max={100}
                  value={pct(mainRegion.width)}
                  onChange={(e) => updateMainRegion({ width: Math.min(1, Math.max(0.02, Number(e.target.value) / 100)) })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
              <label className="text-xs text-white/40">
                Altura (%)
                <input
                  type="number" min={2} max={100}
                  value={pct(mainRegion.height)}
                  onChange={(e) => updateMainRegion({ height: Math.min(1, Math.max(0.02, Number(e.target.value) / 100)) })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
            </div>
            <SliderRow
              label="Zoom do vídeo"
              value={mainZoom}
              min={1} max={3} step={0.05}
              onChange={(v) => updateConfig({ mainZoom: v })}
            />
            <button
              onClick={() => updateConfig({ mainRegion: { ...FULL_FRAME_REGION }, mainZoom: 1 })}
              className="text-xs text-white/40 hover:text-white transition-colors"
            >
              Resetar vídeo principal
            </button>
          </div>

          <button
            onClick={testFacecamCrop}
            disabled={previewing}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {previewing ? 'Gerando preview...' : 'Testar recorte da facecam'}
          </button>
          {previewError && <p className="text-xs text-red-400">{previewError}</p>}
          {previewUrl && (
            <div className="space-y-1.5">
              <p className="text-xs text-white/40">É isso que vai aparecer no painel da facecam (antes do zoom):</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Preview do recorte da facecam" className="w-full rounded-lg border border-white/10" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SliderRow({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/50">
      <span className="w-28 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-violet-500" />
      <span className="w-10 text-right text-white/70">{value.toFixed(2)}</span>
    </label>
  )
}
