'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  videoId: string
  className?: string
}

export function DeleteVideoButton({ videoId, className }: Props) {
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('Excluir este vídeo? Isso apaga a transcrição e todos os cortes gerados a partir dele.')) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Falha ao excluir o vídeo')
        setDeleting(false)
      }
    } catch {
      alert('Falha na conexão')
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      title="Excluir vídeo"
      className={
        className ??
        'flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 text-sm transition-colors disabled:opacity-50'
      }
    >
      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      Excluir vídeo
    </button>
  )
}
