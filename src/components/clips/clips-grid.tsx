'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, CheckSquare } from 'lucide-react'
import { ClipCard } from './clip-card'
import { FormatPickerModal } from './format-picker-modal'
import type { ClipFormat, FitMode } from '@/types'

interface Props {
  clips: any[]
}

export function ClipsGrid({ clips }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const selectableClips = clips.filter((c) => c.status === 'SUGGESTED' || c.status === 'SELECTED')
  const allSelected = selectableClips.length > 0 && selected.size === selectableClips.length

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableClips.map((c) => c.id)))
  }

  // Renders every selected clip in the same chosen format/fitMode — enqueues
  // one job per clip (the worker's own RENDER_CONCURRENCY caps how many run
  // in parallel, this just fires the requests).
  const renderSelected = async (format: ClipFormat, fitMode: FitMode) => {
    setSubmitting(true)
    setError('')
    let failed = 0
    for (const id of Array.from(selected)) {
      try {
        const res = await fetch(`/api/clips/${id}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, fitMode }),
        })
        if (!res.ok) failed++
      } catch {
        failed++
      }
    }
    setSubmitting(false)
    setPickerOpen(false)
    setSelected(new Set())
    if (failed > 0) setError(`${failed} de ${selected.size} corte(s) não puderam ser enfileirados`)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-violet-400" />
        <h2 className="font-semibold">Cortes sugeridos</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400">
          {clips.length}
        </span>
        {selectableClips.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="ml-auto flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {selected.size > 0 && (
        <div className="glass rounded-xl p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-white/60">
            {selected.size} corte{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            Gerar selecionados
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clips.map((clip, i) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={i}
            selectable={clip.status === 'SUGGESTED' || clip.status === 'SELECTED'}
            selected={selected.has(clip.id)}
            onToggleSelect={() => toggle(clip.id)}
          />
        ))}
      </div>

      {pickerOpen && (
        <FormatPickerModal submitting={submitting} onClose={() => setPickerOpen(false)} onConfirm={renderSelected} />
      )}
    </div>
  )
}
