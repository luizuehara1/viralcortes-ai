'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface Props {
  projectId: string
  projectTitle: string
  redirectTo?: string
  className?: string
}

export function DeleteProjectButton({ projectId, projectTitle, redirectTo, className }: Props) {
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Excluir o projeto "${projectTitle}"? Isso apaga todos os vídeos e cortes permanentemente.`)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (res.ok) {
        if (redirectTo) router.push(redirectTo)
        router.refresh()
      } else {
        alert('Falha ao excluir o projeto')
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
      title="Excluir projeto"
      className={
        className ??
        'p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors disabled:opacity-50'
      }
    >
      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  )
}
