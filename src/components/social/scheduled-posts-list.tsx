'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, XCircle, Loader2, Clock, RefreshCw, Instagram, Youtube, BadgeCheck } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'

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

const STATUS_TONE: Record<Status, 'neutral' | 'success' | 'error' | 'warning' | 'violet'> = {
  DRAFT: 'neutral',
  PENDING: 'neutral',
  PUBLISHING: 'violet',
  PUBLISHED: 'success',
  MANUAL_SCHEDULED: 'warning',
  POSTED: 'success',
  FAILED: 'error',
  CANCELLED: 'neutral',
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
    <GlassCard className="p-5 space-y-3">
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
        <LoadingState message="Carregando agendamentos..." className="py-6" />
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
                  <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
                  <span>·</span>
                  <span>{new Date(post.scheduledAt).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-sm text-white/70 truncate mt-0.5">{post.caption}</p>
                {post.status === 'FAILED' && post.errorMessage && (
                  <p className="text-xs text-red-400/80 mt-1">{post.errorMessage}</p>
                )}
                {post.status === 'MANUAL_SCHEDULED' && (
                  <Button
                    onClick={() => markPosted(post.id)}
                    loading={markingId === post.id}
                    variant="ghost"
                    size="sm"
                    icon={<BadgeCheck className="w-3 h-3" />}
                    className="mt-2 !px-2.5"
                  >
                    Marcar como postado
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
