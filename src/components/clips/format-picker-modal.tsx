'use client'

import { useState } from 'react'
import { X, Loader2, Wand2, ShieldCheck } from 'lucide-react'
import type { ClipFormat, FitMode, SplitLayoutMode } from '@/types'
import { CLIP_FORMAT_LABELS, FIT_MODE_LABELS, SPLIT_LAYOUT_LABELS } from '@/types'

interface Props {
  onClose: () => void
  onConfirm: (format: ClipFormat, fitMode: FitMode, layoutMode?: SplitLayoutMode | null) => void
  submitting: boolean
}

// Template personalizado fica para uma segunda etapa — só os 5 formatos
// fixos por enquanto.
const FORMATS: ClipFormat[] = ['ORIGINAL', 'VERTICAL_9_16', 'HORIZONTAL_16_9', 'SQUARE_1_1', 'FEED_4_5']
const FORMAT_ASPECT: Record<ClipFormat, string> = {
  ORIGINAL: '16 / 9',
  VERTICAL_9_16: '9 / 16',
  HORIZONTAL_16_9: '16 / 9',
  SQUARE_1_1: '1 / 1',
  FEED_4_5: '4 / 5',
}
const FIT_MODES: FitMode[] = ['CONTAIN', 'COVER', 'BLUR_BACKGROUND']
const SPLIT_LAYOUT_MODES: SplitLayoutMode[] = ['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']

export function FormatPickerModal({ onClose, onConfirm, submitting }: Props) {
  const [format, setFormat] = useState<ClipFormat>('ORIGINAL')
  const [fitMode, setFitMode] = useState<FitMode>('CONTAIN')
  // Layout com facecam é uma alternativa ao fitMode normal, só faz sentido
  // pra formato vertical — posição padrão de facecam (sem detecção
  // automática ainda, isso fica pro editor) é aplicada na hora do render.
  const [layoutMode, setLayoutMode] = useState<SplitLayoutMode | null>(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="glass rounded-2xl p-6 w-full max-w-md space-y-5 border border-white/10">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Escolha o formato do corte</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                format === f
                  ? 'border-violet-500 bg-violet-500/15'
                  : 'border-white/10 bg-white/3 hover:bg-white/6'
              }`}
            >
              <div
                className={`w-8 h-8 rounded shrink-0 border-2 ${format === f ? 'border-violet-400' : 'border-white/20'}`}
                style={{ aspectRatio: FORMAT_ASPECT[f] }}
              />
              <span className="text-sm font-medium leading-tight">{CLIP_FORMAT_LABELS[f]}</span>
            </button>
          ))}
        </div>

        {format === 'ORIGINAL' ? (
          <p className="text-xs text-white/40 leading-relaxed">
            Mantém a proporção original do vídeo — sem corte, sem zoom, sem mudança de formato.
          </p>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Modo de encaixe</label>
            <div className="space-y-1.5">
              {FIT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setFitMode(m)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    fitMode === m
                      ? 'border-violet-500 bg-violet-500/15 text-white'
                      : 'border-white/10 bg-white/3 text-white/60 hover:bg-white/6'
                  }`}
                >
                  {FIT_MODE_LABELS[m]}
                  {fitMode === m && <span className="w-2 h-2 rounded-full bg-violet-400" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {format === 'VERTICAL_9_16' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Layout com facecam (opcional)</label>
            <div className="space-y-1.5">
              <button
                onClick={() => setLayoutMode(null)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                  !layoutMode ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 bg-white/3 text-white/60 hover:bg-white/6'
                }`}
              >
                Nenhum
              </button>
              {SPLIT_LAYOUT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setLayoutMode(m)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    layoutMode === m ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 bg-white/3 text-white/60 hover:bg-white/6'
                  }`}
                >
                  {SPLIT_LAYOUT_LABELS[m]}
                </button>
              ))}
            </div>
            {layoutMode && (
              <p className="text-xs text-white/30">
                Usa uma posição padrão pra facecam — ajuste depois no editor (aba &quot;Layout&quot;).
              </p>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-white/3 text-xs text-white/40">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400/70" />
          <span>Áudio original mantido · 30 FPS constante · sem legendas ou textos automáticos</span>
        </div>

        <button
          onClick={() => onConfirm(format, fitMode, layoutMode)}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 font-semibold transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {submitting ? 'Enfileirando...' : 'Gerar corte'}
        </button>
      </div>
    </div>
  )
}
