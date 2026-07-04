'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wand2, ShieldCheck, AlertTriangle } from 'lucide-react'
import type { ClipFormat, FitMode, SplitLayoutMode } from '@/types'
import { CLIP_FORMAT_LABELS, FIT_MODE_LABELS, SPLIT_LAYOUT_LABELS } from '@/types'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

// Resultado que quem chama onConfirm pode devolver pra pedir que o modal
// FIQUE ABERTO e mostre um aviso, em vez de fechar como se tivesse dado
// certo — hoje só usado pro caso "layout com facecam escolhido mas a região
// não foi confirmada" (ver clip-card.tsx). Retornar undefined/void continua
// significando "seguiu em frente, feche o modal" (quem chama já cuida disso).
export type ConfirmOutcome =
  | { ok: true }
  | { ok: false; reason: 'FACECAM_UNCONFIRMED'; editorHref?: string }
  | { ok: false; reason: 'ERROR' }

interface Props {
  onClose: () => void
  onConfirm: (format: ClipFormat, fitMode: FitMode, layoutMode?: SplitLayoutMode | null) => void | Promise<ConfirmOutcome | void>
  submitting: boolean
  // Erro vindo do request anterior (ex.: falha ao enfileirar) — exibido
  // DENTRO do modal, porque enquanto ele está aberto o card por trás (onde o
  // erro também aparece) fica coberto pelo overlay e o usuário nunca vê a
  // mensagem.
  error?: string
  // Pré-seleciona o formato escolhido no seletor "Formato de saída" do
  // editor (editorState.canvas) — só passado quando o modal abre a partir
  // de um editor já com um canvas escolhido, não no fluxo de geração em lote.
  defaultFormat?: ClipFormat
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
// Espelha FORMAT_DIMENSIONS de src/lib/ffmpeg.ts — só pra mostrar a
// resolução final na confirmação (null = ORIGINAL, resolvido a partir do
// vídeo fonte só na hora do render).
const FORMAT_DIMENSIONS_DISPLAY: Record<ClipFormat, { width: number; height: number } | null> = {
  ORIGINAL: null,
  VERTICAL_9_16: { width: 1080, height: 1920 },
  SQUARE_1_1: { width: 1080, height: 1080 },
  HORIZONTAL_16_9: { width: 1920, height: 1080 },
  FEED_4_5: { width: 1080, height: 1350 },
}
const FIT_MODES: FitMode[] = ['CONTAIN', 'COVER', 'BLUR_BACKGROUND']
const SPLIT_LAYOUT_MODES: SplitLayoutMode[] = ['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']

export function FormatPickerModal({ onClose, onConfirm, submitting, error, defaultFormat }: Props) {
  const [format, setFormat] = useState<ClipFormat>(defaultFormat ?? 'ORIGINAL')
  const [fitMode, setFitMode] = useState<FitMode>('CONTAIN')
  // Layout com facecam é uma alternativa ao fitMode normal, só faz sentido
  // pra formato vertical.
  const [layoutMode, setLayoutMode] = useState<SplitLayoutMode | null>(null)
  const [facecamWarning, setFacecamWarning] = useState<{ editorHref?: string } | null>(null)

  const dimensions = FORMAT_DIMENSIONS_DISPLAY[format]

  const handleConfirm = async () => {
    setFacecamWarning(null)
    const result = await onConfirm(format, fitMode, layoutMode)
    if (result && result.ok === false && result.reason === 'FACECAM_UNCONFIRMED') {
      setFacecamWarning({ editorHref: result.editorHref })
    }
  }

  return (
    <Modal
      onClose={!submitting ? onClose : undefined}
      closable={!submitting}
      title="Configurar geração do corte"
      maxWidth="max-w-md"
      footer={
        <div className="flex gap-2.5">
          <Button onClick={onClose} disabled={submitting} variant="secondary" className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} loading={submitting} icon={<Wand2 className="w-4 h-4" />} className="flex-[2]" size="lg">
            {submitting ? 'Enfileirando...' : 'Gerar corte agora'}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/70">Formato de saída</label>
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
              onClick={() => {
                setLayoutMode(null)
                setFacecamWarning(null)
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                !layoutMode ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 bg-white/3 text-white/60 hover:bg-white/6'
              }`}
            >
              Nenhum
            </button>
            {SPLIT_LAYOUT_MODES.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setLayoutMode(m)
                  setFacecamWarning(null)
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                  layoutMode === m ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 bg-white/3 text-white/60 hover:bg-white/6'
                }`}
              >
                {SPLIT_LAYOUT_LABELS[m]}
              </button>
            ))}
          </div>
          {layoutMode && !facecamWarning && (
            <p className="text-xs text-white/30">
              Detectamos a facecam automaticamente na hora de gerar — se falhar, ajustamos depois no editor (aba &quot;Layout&quot;).
            </p>
          )}
          {facecamWarning && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p>Não conseguimos detectar a facecam automaticamente. Ajuste/detecte a facecam antes de gerar este layout.</p>
                {facecamWarning.editorHref && (
                  <Link
                    href={facecamWarning.editorHref}
                    className="inline-flex items-center gap-1 font-medium text-amber-100 hover:text-white underline underline-offset-2"
                  >
                    Ver/Ajustar Cam
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumo da escolha antes de gerar */}
      <div className="px-3 py-2.5 rounded-lg bg-white/3 text-xs text-white/50 space-y-1">
        <p className="font-medium text-white/70">Resumo</p>
        <p>Formato: {CLIP_FORMAT_LABELS[format]}</p>
        {format !== 'ORIGINAL' && <p>Modo de encaixe: {FIT_MODE_LABELS[fitMode]}</p>}
        {format === 'VERTICAL_9_16' && <p>Layout: {layoutMode ? SPLIT_LAYOUT_LABELS[layoutMode] : 'Nenhum (sem facecam)'}</p>}
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-white/3 text-xs text-white/40">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400/70" />
        <span>
          {dimensions
            ? `Este vídeo será exportado em ${dimensions.width}x${dimensions.height} — ${CLIP_FORMAT_LABELS[format]}`
            : 'Mantém a resolução original do vídeo fonte'}
          {' · Áudio original mantido · 30 FPS constante'}
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
