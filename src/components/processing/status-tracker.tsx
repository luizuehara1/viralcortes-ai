'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle, RotateCcw, Ban, Zap } from 'lucide-react'
import type { VideoStatus, SourceType } from '@/types'
import { VIDEO_STATUS_STEPS } from '@/types'

interface ChunkProgress {
  type: 'TRANSCRIBE' | 'ANALYZE_CLIPS'
  progress: number
  totalChunks?: number
  processedChunks?: number
  currentChunk?: number
}

interface Props {
  sourceVideoId: string
  initialStatus: VideoStatus
  sourceType?: SourceType
  isLongLive?: boolean
  onCompleted?: () => void
}

const POLL_INTERVAL = 3000
// Generous threshold — some stages (chunked transcription of long videos)
// can legitimately go a few minutes without an updatedAt change. This is
// meant to catch a genuinely stuck job (e.g. worker not running), not to
// flag normal slow steps.
const STUCK_THRESHOLD_MS = 3 * 60 * 1000

export function StatusTracker({ sourceVideoId, initialStatus, sourceType, isLongLive, onCompleted }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<VideoStatus>(initialStatus)
  const [clipsCount, setClipsCount] = useState(0)
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showTechnicalError, setShowTechnicalError] = useState(false)
  const [stuck, setStuck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const lastChangedAtRef = useRef<number>(Date.now())
  const lastUpdatedAtRef = useRef<string | null>(null)

  const isTerminal = status === 'COMPLETED' || status === 'FAILED'

  useEffect(() => {
    if (isTerminal) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    // Self-scheduling poll (next request only fires after the previous one
    // resolves) instead of setInterval, so a slow response never piles up
    // concurrent requests against the server.
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${sourceVideoId}`)
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (cancelled) return
          setStatus(data.status)
          setClipsCount(data.suggestedClips?.length ?? 0)
          setChunkProgress(data.chunkProgress ?? null)
          setErrorMessage(data.errorMessage ?? null)

          if (data.updatedAt !== lastUpdatedAtRef.current) {
            lastUpdatedAtRef.current = data.updatedAt
            lastChangedAtRef.current = Date.now()
            setStuck(false)
          } else if (Date.now() - lastChangedAtRef.current > STUCK_THRESHOLD_MS) {
            setStuck(true)
          }

          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            if (data.status === 'COMPLETED') onCompleted?.()
            return
          }
        }
      } catch {}
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL)
    }

    timer = setTimeout(tick, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sourceVideoId, isTerminal, onCompleted])

  const retry = async () => {
    setBusy(true)
    setActionError('')
    try {
      const res = await fetch(`/api/videos/${sourceVideoId}/retry`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        setStatus('EXTRACTING_AUDIO')
        setErrorMessage(null)
        setStuck(false)
        lastUpdatedAtRef.current = null
        lastChangedAtRef.current = Date.now()
        router.refresh()
      } else {
        setActionError(body?.error || 'Falha ao reiniciar o processamento')
      }
    } catch {
      setActionError('Falha na conexão')
    }
    setBusy(false)
  }

  const cancelProcessing = async () => {
    if (!confirm('Cancelar o processamento deste vídeo?')) return
    setBusy(true)
    setActionError('')
    try {
      const res = await fetch(`/api/videos/${sourceVideoId}/cancel`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        setStatus('FAILED')
        setErrorMessage('Cancelado pelo usuário')
        router.refresh()
      } else {
        setActionError(body?.error || 'Falha ao cancelar')
      }
    } catch {
      setActionError('Falha na conexão')
    }
    setBusy(false)
  }

  const steps: Array<{ key: VideoStatus; label: string }> =
    sourceType === 'URL'
      ? [
          { key: 'IMPORTING', label: 'Importando vídeo' },
          { key: 'EXTRACTING_AUDIO', label: 'Extraindo áudio' },
          { key: 'TRANSCRIBING', label: 'Transcrevendo com Whisper' },
          { key: 'ANALYZING', label: 'Detectando melhores momentos (IA)' },
          { key: 'COMPLETED', label: 'Cortes gerados!' },
        ]
      : [
          { key: 'UPLOADING', label: 'Vídeo enviado' },
          { key: 'EXTRACTING_AUDIO', label: 'Extraindo áudio' },
          { key: 'TRANSCRIBING', label: 'Transcrevendo com Whisper' },
          { key: 'ANALYZING', label: 'Detectando melhores momentos (IA)' },
          { key: 'COMPLETED', label: 'Cortes gerados!' },
        ]

  const currentStep = VIDEO_STATUS_STEPS[status]?.step ?? 0
  const currentStepLabel = steps.find((s) => s.key === status)?.label

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold">Status do processamento</h3>
        {status === 'COMPLETED' && clipsCount > 0 && (
          <span className="text-sm text-green-400 font-medium">{clipsCount} cortes encontrados</span>
        )}
      </div>

      {isLongLive && !isTerminal && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 mb-4">
          <Zap className="w-5 h-5 shrink-0 text-violet-400 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-violet-300">Modo Live Longa ativado</p>
            <p className="text-xs text-white/40 mt-0.5">
              Esta live será analisada em partes para gerar até 50 cortes virais.
            </p>
          </div>
        </div>
      )}

      {status === 'FAILED' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
            <XCircle className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Processamento falhou</p>
              <p className="text-sm text-red-400/70 mt-0.5">Tente novamente ou envie outro arquivo</p>
            </div>
          </div>

          {errorMessage && (
            <div>
              <button
                onClick={() => setShowTechnicalError(!showTechnicalError)}
                className="text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                {showTechnicalError ? 'Ocultar erro técnico' : 'Ver erro técnico'}
              </button>
              {showTechnicalError && (
                <pre className="mt-2 p-3 rounded-xl bg-black/30 border border-white/10 text-xs text-white/50 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {errorMessage}
                </pre>
              )}
            </div>
          )}

          {actionError && <p className="text-xs text-red-400">{actionError}</p>}

          <button
            onClick={retry}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium transition-all"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {stuck && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">Processamento aparentemente travado</p>
                <p className="text-xs text-yellow-400/70 mt-0.5">
                  &ldquo;{currentStepLabel}&rdquo; não avança há alguns minutos. Você pode tentar novamente.
                </p>
                {actionError && <p className="text-xs text-red-400 mt-1">{actionError}</p>}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={retry}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Tentar novamente
                  </button>
                  <button
                    onClick={cancelProcessing}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {steps.map((step) => {
            // Compare against each step's own global step number (not local
            // array position) so this works whether or not IMPORTING is
            // present in the sequence.
            const stepNum = VIDEO_STATUS_STEPS[step.key].step
            const isDone = currentStep > stepNum || status === 'COMPLETED'
            const isActive = currentStep === stepNum && status !== 'COMPLETED'

            return (
              <div key={step.key} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                isActive ? 'bg-violet-500/10 border border-violet-500/20' : ''
              }`}>
                <div className="shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                  ) : (
                    <Circle className="w-5 h-5 text-white/20" />
                  )}
                </div>
                <span className={`text-sm ${
                  isDone ? 'text-white/70 line-through decoration-white/20' :
                  isActive ? 'text-white font-medium' :
                  'text-white/30'
                }`}>
                  {step.label}
                </span>
                {isActive && (
                  <span className="ml-auto text-xs text-violet-400 animate-pulse-slow">
                    {isActive && chunkProgress && chunkProgress.totalChunks && chunkProgress.totalChunks > 1
                      ? `${chunkProgress.type === 'TRANSCRIBE' ? 'Transcrevendo' : 'Analisando'} parte ${chunkProgress.currentChunk ?? chunkProgress.processedChunks ?? 0} de ${chunkProgress.totalChunks}`
                      : 'processando...'}
                  </span>
                )}
              </div>
            )
          })}

          {!stuck && (
            <button
              onClick={cancelProcessing}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white/30 hover:text-red-400 disabled:opacity-50 transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancelar processamento
            </button>
          )}
        </div>
      )}
    </div>
  )
}
