'use client'

import { useState } from 'react'
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import {
  SPLIT_LAYOUT_LABELS, DEFAULT_SPLIT_LAYOUT_CONFIG, DEFAULT_SPLIT_RATIO_BY_MODE,
  type SplitLayoutMode, type SplitLayoutConfig,
} from '@/types'

interface Props {
  layoutMode: SplitLayoutMode | null | undefined
  layoutConfig: SplitLayoutConfig | undefined
  detectEndpoint: string
  onChange: (layoutMode: SplitLayoutMode | null, layoutConfig: SplitLayoutConfig | undefined) => void
  // Último ajuste salvo do usuário (User.lastSplitLayoutConfig) — usado como
  // ponto de partida ao escolher um layout pela primeira vez neste clipe,
  // em vez do padrão fixo (canto inferior direito).
  lastUsedConfig?: SplitLayoutConfig | null
}

const MODES: SplitLayoutMode[] = ['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']

export function LayoutPanel({ layoutMode, layoutConfig, detectEndpoint, onChange, lastUsedConfig }: Props) {
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState('')

  const config = layoutConfig ?? lastUsedConfig ?? DEFAULT_SPLIT_LAYOUT_CONFIG

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
      onChange(mode, { ...base, facecamConfirmed: true })
      return
    }
    onChange(mode, base)
    setDetecting(true)
    setDetectError('')
    try {
      const res = await fetch(detectEndpoint, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.detected && body.region) {
        onChange(mode, { ...base, facecamRegion: body.region, facecamConfirmed: true })
      } else {
        setDetectError('Facecam não detectada automaticamente. Ajuste manualmente a área.')
        onChange(mode, { ...base, facecamConfirmed: false })
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

  const detectAutomatically = async () => {
    setDetecting(true)
    setDetectError('')
    try {
      const res = await fetch(detectEndpoint, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao detectar a facecam')
      if (!body.detected) {
        setDetectError('Facecam não detectada automaticamente. Ajuste manualmente a área.')
        if (layoutMode) onChange(layoutMode, { ...config, facecamConfirmed: false })
        return
      }
      if (layoutMode) onChange(layoutMode, { ...config, facecamRegion: body.region, facecamConfirmed: true })
    } catch (err: any) {
      setDetectError(err.message || 'Falha ao detectar a facecam')
    } finally {
      setDetecting(false)
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

          <p className="text-xs text-white/30">Arraste o retângulo no preview pra reposicionar a facecam, ou ajuste os campos abaixo.</p>

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
