'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, Film, Loader2, CheckCircle2, AlertCircle, X
} from 'lucide-react'
import { formatFileSize } from '@/lib/utils'

interface Props {
  projectId: string
  onSuccess: (sourceVideoId: string) => void
}

const ACCEPTED = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],
  'video/x-matroska': ['.mkv'],
}

const MAX_SIZE_GB = 10

export function VideoUpload({ projectId, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

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
    formData.append('projectId', projectId)
    formData.append('title', file.name.replace(/\.[^.]+$/, ''))

    try {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      const response = await new Promise<{ sourceVideoId: string }>((resolve, reject) => {
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
        xhr.open('POST', '/api/upload')
        xhr.send(formData)
      })

      setDone(true)
      setTimeout(() => onSuccess(response.sourceVideoId), 800)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar vídeo')
      setUploading(false)
    }
  }

  if (done) {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Upload concluído!</h3>
        <p className="text-white/40 text-sm">Redirecionando para o processamento...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/15">
        <p className="text-sm text-amber-300/80 font-medium mb-0.5">Aviso de conteúdo</p>
        <p className="text-xs text-white/40">
          Envie apenas conteúdo próprio ou com autorização do criador. Não processamos conteúdo
          protegido por DRM, paywall ou direitos autorais de terceiros.
        </p>
      </div>

      {!file ? (
        <div
          {...getRootProps()}
          className={`glass rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 border-2 border-dashed ${
            isDragActive
              ? 'border-violet-500/60 bg-violet-500/5'
              : 'border-white/10 hover:border-violet-500/30 hover:bg-white/2'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-16 h-16 rounded-2xl bg-violet-500/15 flex items-center justify-center mx-auto mb-4">
            <Upload className={`w-8 h-8 transition-colors ${isDragActive ? 'text-violet-400' : 'text-white/40'}`} />
          </div>
          <h3 className="font-semibold text-lg mb-2">
            {isDragActive ? 'Solte o arquivo aqui' : 'Arraste seu vídeo ou clique para selecionar'}
          </h3>
          <p className="text-white/40 text-sm">
            MP4, MOV, AVI, WEBM, MKV · Máximo 10GB · Lives de até 24 horas
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6">
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

          {error && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

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
              <p className="text-xs text-white/30 mt-2 text-center">
                Vídeos grandes podem levar alguns minutos...
              </p>
            </div>
          )}

          <button
            onClick={upload}
            disabled={uploading}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? `Enviando... ${progress}%` : 'Enviar e analisar'}
          </button>
        </div>
      )}
    </div>
  )
}
