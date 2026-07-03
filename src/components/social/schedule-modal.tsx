'use client'

import { useState } from 'react'
import { X, Loader2, CalendarClock, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Props {
  sourceType: 'CLIP' | 'TEMPLATE_OUTPUT'
  sourceId: string
  defaultCaption?: string
  onClose: () => void
}

// now + 5min, formatado pro input datetime-local (que espera hora local,
// não UTC) — evita que o usuário consiga agendar "no passado" por engano.
function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleModal({ sourceType, sourceId, defaultCaption, onClose }: Props) {
  const [caption, setCaption] = useState(defaultCaption || '')
  const [scheduledAt, setScheduledAt] = useState(minDateTimeLocal())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/social/instagram/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          sourceId,
          caption,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao agendar publicação')
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Falha ao agendar publicação')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="glass rounded-2xl p-6 w-full max-w-md space-y-5 border border-white/10">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-violet-400" />
            Agendar no Instagram
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Publicação agendada! Acompanhe o status em Integrações.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Legenda</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                rows={4}
                placeholder="Escreva a legenda do Reels..."
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm resize-none focus:outline-none focus:border-violet-500/50"
              />
              <p className="text-xs text-white/30 text-right">{caption.length}/2200</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Data e hora</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minDateTimeLocal()}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || !caption.trim()}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 font-semibold transition-all flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
              {submitting ? 'Agendando...' : 'Agendar publicação'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
