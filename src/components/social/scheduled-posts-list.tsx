'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, XCircle, Loader2, Clock, RefreshCw, Instagram, Youtube, BadgeCheck } from 'lucide-react'

type Status = 'DRAFT' | 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'MANUAL_SCHEDULED' | 'POSTED' | 'FAILED' | 'CANCELLED'
type Platform = 'INSTAGRAM_REELS' | 'YOUTUBE_SHORTS' | 'INSTAGRAM'

interface ScheduledPost {
  id: string
  sourceType: 'CLIP' | 'TEMPLATE_OUTPUT'
  platform: Platform
  caption: string
  scheduledAt: string
  status: Status
  instagramMediaId: string | null
  errorMessage: string | null
  createdAt: string
}

const STATUS_ICON: Record<Status, React.ReactNode> = {
  DRAFT: <Clock className="w-4 h-4 text-white/40" />,
  PENDING: <Clock className="w-4 h-4 text-white/40" />,
  PUBLISHING: <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />,
  PUBLISHED: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  MANUAL_SCHEDULED: <Clock className="w-4 h-4 text-yellow-400" />,
  POSTED: <BadgeCheck className="w-4 h-4 text-green-400" />,
  FAILED: <XCircle className="w-4 h-4 text-red-400" />,
  CANCELLED: <XCircle className="w-4 h-4 text-white/30" />,
}

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Agendado',
  PUBLISHING: 'Publicando...',
  PUBLISHED: 'Publicado',
  MANUAL_SCHEDULED: 'Agendado manualmente',
  POSTED: 'Postado',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
}

const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM_REELS: 'Instagram Reels',
  YOUTUBE_SHORTS: 'YouTube Shorts',
  INSTAGRAM: 'Instagram',
}

const PLATFORM_ICON: Record<Platform, React.ReactNode> = {
  INSTAGRAM_REELS: <Instagram className="w-3.5 h-3.5" />,
  INSTAGRAM: <Instagram className="w-3.5 h-3.5" />,
  YOUTUBE_SHORTS: <Youtube className="w-3.5 h-3.5" />,
}

// Lista simples dos agendamentos do usuário — sem polling automático (dá pra
// atualizar com o botão), já que publicação é algo que roda em background.
export function ScheduledPostsList() {
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)

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

  const markPosted = async (id: string) => {
    setMarkingId(id)
    try {
      const res = await fetch(`/api/social/instagram/scheduled/${id}/mark-posted`, { method: 'POST' })
      if (res.ok) await load()
    } finally {
      setMarkingId(null)
    }
  }

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
                <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap">
                  <span className="flex items-center gap-1">{PLATFORM_ICON[post.platform]} {PLATFORM_LABEL[post.platform]}</span>
                  <span>·</span>
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
                {post.status === 'MANUAL_SCHEDULED' && (
                  <button
                    onClick={() => markPosted(post.id)}
                    disabled={markingId === post.id}
                    className="mt-2 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-green-500/20 hover:text-green-300 text-white/50 transition-colors disabled:opacity-50"
                  >
                    {markingId === post.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <BadgeCheck className="w-3 h-3" />}
                    Marcar como postado
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
