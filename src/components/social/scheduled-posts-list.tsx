'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, XCircle, Loader2, Clock, RefreshCw } from 'lucide-react'

interface ScheduledPost {
  id: string
  sourceType: 'CLIP' | 'TEMPLATE_OUTPUT'
  platform: string
  caption: string
  scheduledAt: string
  status: 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED'
  instagramMediaId: string | null
  errorMessage: string | null
  createdAt: string
}

const STATUS_ICON: Record<ScheduledPost['status'], React.ReactNode> = {
  PENDING: <Clock className="w-4 h-4 text-white/40" />,
  PUBLISHING: <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />,
  PUBLISHED: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  FAILED: <XCircle className="w-4 h-4 text-red-400" />,
}

const STATUS_LABEL: Record<ScheduledPost['status'], string> = {
  PENDING: 'Agendado',
  PUBLISHING: 'Publicando...',
  PUBLISHED: 'Publicado',
  FAILED: 'Falhou',
}

// Lista simples dos agendamentos do usuário — sem polling automático (dá pra
// atualizar com o botão), já que publicação é algo que roda em background.
export function ScheduledPostsList() {
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/social/instagram/scheduled')
      const body = await res.json().catch(() => null)
      if (res.ok) setPosts(body.posts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (!loading && (!posts || posts.length === 0)) return null

  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-violet-400" />
          Publicações agendadas
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !posts ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-white/30" />
        </div>
      ) : (
        <div className="space-y-2">
          {posts!.map((post) => (
            <div key={post.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <div className="shrink-0 mt-0.5">{STATUS_ICON[post.status]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span>{post.sourceType === 'CLIP' ? 'Corte' : 'Template'}</span>
                  <span>·</span>
                  <span>{STATUS_LABEL[post.status]}</span>
                  <span>·</span>
                  <span>{new Date(post.scheduledAt).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-sm text-white/70 truncate mt-0.5">{post.caption}</p>
                {post.status === 'FAILED' && post.errorMessage && (
                  <p className="text-xs text-red-400/80 mt-1">{post.errorMessage}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
