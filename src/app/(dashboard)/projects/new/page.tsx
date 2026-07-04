'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, LinkIcon, ShieldCheck } from 'lucide-react'
import { VideoUpload } from '@/components/upload/video-upload'
import { VideoLinkImport } from '@/components/upload/video-link-import'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Stepper } from '@/components/ui/stepper'

type Step = 'info' | 'source' | 'upload' | 'link'

export default function NewProjectPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [step, setStep] = useState<Step>('info')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })

    if (res.ok) {
      const data = await res.json()
      setProjectId(data.id)
      setStep('source')
    }
    setCreating(false)
  }

  const stepIndex = step === 'info' ? 0 : 1

  return (
    <div className="max-w-2xl mx-auto animate-in">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="p-2 rounded-lg glass hover:bg-white/8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Novo projeto</h1>
          <p className="text-white/40 text-sm">
            {step === 'info' ? 'Dê um nome ao projeto' : step === 'source' ? 'De onde vem o vídeo?' : 'Envie seu vídeo ou live'}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <Stepper steps={[{ label: 'Informações' }, { label: 'Vídeo' }]} currentStep={stepIndex} />
      </div>

      {step === 'info' && (
        <form onSubmit={createProject}>
          <GlassCard className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70">Nome do projeto</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ex: Live do dia 15/01, Podcast EP 42..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                autoFocus
              />
            </div>

            <div className="flex items-start gap-2 p-4 rounded-xl bg-violet-500/8 border border-violet-500/15">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" />
              <div>
                <p className="text-sm text-violet-300/80 font-medium mb-1">Importante</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  Este app processa apenas conteúdo próprio ou com autorização do criador. Não processe
                  conteúdo protegido por direitos autorais sem permissão.
                </p>
              </div>
            </div>

            <Button type="submit" loading={creating} disabled={!title.trim()} className="w-full" size="lg">
              {creating ? 'Criando...' : 'Criar projeto →'}
            </Button>
          </GlassCard>
        </form>
      )}

      {step === 'source' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setStep('upload')}
            className="glass-hover rounded-2xl p-8 text-left border border-white/10 hover:border-violet-500/40 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4 transition-transform group-hover:scale-105">
              <Upload className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="font-semibold mb-1">Enviar vídeo do PC</h3>
            <p className="text-sm text-white/40">MP4, MOV, MKV, WEBM — até 10GB</p>
          </button>

          <button
            onClick={() => setStep('link')}
            className="glass-hover rounded-2xl p-8 text-left border border-white/10 hover:border-violet-500/40 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4 transition-transform group-hover:scale-105">
              <LinkIcon className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="font-semibold mb-1">Importar por link</h3>
            <p className="text-sm text-white/40">YouTube, Twitch, Kick, TikTok, Instagram, Facebook e mais</p>
          </button>
        </div>
      )}

      {step === 'upload' && (
        <VideoUpload
          projectId={projectId!}
          onSuccess={() => router.push(`/projects/${projectId}`)}
        />
      )}

      {step === 'link' && (
        <VideoLinkImport
          projectId={projectId!}
          onSuccess={() => router.push(`/projects/${projectId}`)}
          onSwitchToUpload={() => setStep('upload')}
        />
      )}
    </div>
  )
}
