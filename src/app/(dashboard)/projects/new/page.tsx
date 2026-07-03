'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Upload, LinkIcon } from 'lucide-react'
import { VideoUpload } from '@/components/upload/video-upload'
import { VideoLinkImport } from '@/components/upload/video-link-import'

type Step = 'info' | 'source' | 'upload' | 'link'

const STEP_LABELS: Record<Step, string> = {
  info: 'Informações',
  source: 'Origem do vídeo',
  upload: 'Upload do vídeo',
  link: 'Importar por link',
}

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
  const stepList: Step[] = step === 'upload' ? ['info', 'upload'] : step === 'link' ? ['info', 'link'] : ['info', 'source']

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

      {/* Progress */}
      <div className="flex items-center gap-3 mb-8">
        {stepList.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-white/10" />}
            <div className={`flex items-center gap-2 ${
              i === stepIndex ? 'text-violet-400' : i < stepIndex ? 'text-green-400' : 'text-white/30'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                i === stepIndex
                  ? 'border-violet-500 bg-violet-500/20 text-violet-400'
                  : i < stepIndex
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : 'border-white/10 text-white/30'
              }`}>
                {i + 1}
              </div>
              <span className="text-sm">{STEP_LABELS[s]}</span>
            </div>
          </div>
        ))}
      </div>

      {step === 'info' && (
        <form onSubmit={createProject} className="glass rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Nome do projeto</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex: Live do dia 15/01, Podcast EP 42..."
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 transition-all"
              autoFocus
            />
          </div>

          <div className="p-4 rounded-xl bg-violet-500/8 border border-violet-500/15">
            <p className="text-sm text-violet-300/80 font-medium mb-1">Importante</p>
            <p className="text-xs text-white/40 leading-relaxed">
              Este app processa apenas conteúdo próprio ou com autorização do criador. Não processe
              conteúdo protegido por direitos autorais sem permissão.
            </p>
          </div>

          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {creating ? 'Criando...' : 'Criar projeto →'}
          </button>
        </form>
      )}

      {step === 'source' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setStep('upload')}
            className="glass-hover rounded-2xl p-8 text-left border border-white/10 hover:border-violet-500/30 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="font-semibold mb-1">Enviar vídeo do PC</h3>
            <p className="text-sm text-white/40">MP4, MOV, MKV, WEBM — até 10GB</p>
          </button>

          <button
            onClick={() => setStep('link')}
            className="glass-hover rounded-2xl p-8 text-left border border-white/10 hover:border-violet-500/30 transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4">
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
