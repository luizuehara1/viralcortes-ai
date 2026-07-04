'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Upload, Film, X } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { ErrorState } from '@/components/ui/error-state'

const ACCEPTED = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/x-matroska': ['.mkv'],
}

const MAX_SIZE_GB = 10

// Upload direto de um vídeo pro editor ("começar do zero"), sem passar pelo
// pipeline de IA de um projeto nem pelo Template Studio — POST /api/editor/upload
// cria um TemplateOutput e devolve o editor já pronto pra abrir.
export function EditorUploadCard() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    if (rejected.length > 0) {
      setError('Formato não suportado ou arquivo muito grande (máx 10GB)')
      return
    }
    setFile(accepted[0])
    setError('')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: MAX_SIZE_GB * 1024 * 1024 * 1024,
  })

  const upload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      })

      const response = await new Promise<{ redirectTo: string }>((resolve, reject) => {
        const parseBody = () => {
          try {
            return JSON.parse(xhr.responseText)
          } catch {
            return null
          }
        }
        xhr.onload = () => {
          const body = parseBody()
          if (xhr.status >= 200 && xhr.status < 300 && body) {
            resolve(body)
          } else {
            reject(new Error(body?.error || `Erro no upload (HTTP ${xhr.status || 'desconhecido'})`))
          }
        }
        xhr.onerror = () => reject(new Error('Falha na conexão'))
        xhr.ontimeout = () => reject(new Error('Tempo esgotado ao enviar o vídeo'))
        xhr.open('POST', '/api/editor/upload')
        xhr.send(formData)
      })

      router.push(response.redirectTo)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar vídeo')
      setUploading(false)
    }
  }

  if (!file) {
    return (
      <div
        {...getRootProps()}
        className={`glass rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 border-2 border-dashed ${
          isDragActive
            ? 'border-violet-500/60 bg-violet-500/5'
            : 'border-white/10 hover:border-violet-500/30 hover:bg-white/2'
        }`}
      >
        <input {...getInputProps()} />
        <div className="w-14 h-14 rounded-2xl bg-violet-500/15 flex items-center justify-center mx-auto mb-3">
          <Upload className={`w-7 h-7 transition-colors ${isDragActive ? 'text-violet-400' : 'text-white/40'}`} />
        </div>
        <h3 className="font-semibold text-base mb-1.5">
          {isDragActive ? 'Solte o arquivo aqui' : 'Arraste um arquivo aqui ou clique para selecionar'}
        </h3>
        <p className="text-white/40 text-sm">MP4, MOV, WEBM, MKV · Até 10GB</p>
        {error && (
          <div className="mt-4 max-w-sm mx-auto text-left">
            <ErrorState message={error} />
          </div>
        )}
      </div>
    )
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
          <Film className="w-6 h-6 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{file.name}</p>
          <p className="text-sm text-white/40">{formatFileSize(file.size)}</p>
        </div>
        {!uploading && (
          <button
            onClick={() => setFile(null)}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {uploading && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/60">Enviando vídeo...</span>
            <span className="text-violet-400 font-medium">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <Button onClick={upload} loading={uploading} icon={<Upload className="w-4 h-4" />} className="w-full" size="lg">
        {uploading ? `Enviando... ${progress}%` : 'Enviar e abrir no editor'}
      </Button>
    </GlassCard>
  )
}
