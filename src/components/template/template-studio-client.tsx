'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Upload, Wand2, Download, Loader2, ImageIcon, AlertCircle, RefreshCw, Video, CheckCircle2, Pencil, Instagram, Youtube } from 'lucide-react'
import { ScheduleModal } from '@/components/social/schedule-modal'

interface Region {
  index: number
  x: number
  y: number
  width: number
  height: number
  fillRatio: number
}

interface TemplateInfo {
  templateId: string
  width: number
  height: number
  regions: Region[]
  previewUrl: string
  // true quando veio do último template usado (lembrado automaticamente),
  // não de um upload novo nem do template de exemplo pela primeira vez.
  reused?: boolean
}

type Mode = 'template' | 'original'

interface GenerateResult {
  outputUrl: string
  mediaType: 'image' | 'video'
  templateOutputId: string
}

interface FacecamCrop {
  x: number
  y: number
  width: number
  height: number
  // 'manual' is the authoritative source once set — auto-detection never
  // runs again or overwrites it for the current video. 'auto' means this is
  // still exactly what Claude Vision detected, untouched by the user.
  source: 'manual' | 'auto'
}

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function xhrUpload(url: string, formData: FormData, onProgress?: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.onload = () => {
      const body = parseJsonSafe(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body)
      else reject(new Error(body?.error || `Erro (HTTP ${xhr.status || 'desconhecido'})`))
    }
    xhr.onerror = () => reject(new Error('Falha na conexão'))
    xhr.open('POST', url)
    xhr.send(formData)
  })
}

export function TemplateStudioClient() {
  const [mode, setMode] = useState<Mode>('template')
  const [template, setTemplate] = useState<TemplateInfo | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<number | 'all'>(0)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState('')
  const [schedulePlatform, setSchedulePlatform] = useState<'INSTAGRAM_REELS' | 'YOUTUBE_SHORTS' | null>(null)
  const [autoSchedule, setAutoSchedule] = useState(false)

  // Facecam auto-split state (only relevant when the template has exactly 2
  // blue regions and the uploaded media is a video). facecamCrop is the
  // single source of truth used by both the preview overlay and the final
  // render — whatever is in it (manual or auto) is exactly what gets sent.
  const [videoDims, setVideoDims] = useState<{ width: number; height: number } | null>(null)
  const [facecamMediaId, setFacecamMediaId] = useState<string | null>(null)
  const [facecamDetecting, setFacecamDetecting] = useState(false)
  const [facecamCrop, setFacecamCrop] = useState<FacecamCrop | null>(null)
  const [facecamConfidence, setFacecamConfidence] = useState<number | null>(null)
  const [facecamError, setFacecamError] = useState('')

  const templateInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const loadTemplate = async (file?: File) => {
    setLoadingTemplate(true)
    setError('')
    setResult(null)
    try {
      const formData = new FormData()
      if (file) formData.append('templateFile', file)
      const res = await fetch('/api/template/detect', { method: 'POST', body: formData })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || 'Falha ao analisar o template')
      setTemplate(body)
      setSelectedRegion(body.regions.length > 1 ? 'all' : 0)
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar o template')
    } finally {
      setLoadingTemplate(false)
    }
  }

  useEffect(() => {
    loadTemplate()
  }, [])

  const isVideo = mediaFile?.type.startsWith('video/')
  // Largest blue region = main content, smallest = facecam — only makes
  // sense to auto-split when there are exactly 2 regions and the media is a
  // single video with an embedded facecam corner.
  const needsFacecamSplit = !!template && template.regions.length === 2 && !!isVideo

  const resetFacecamState = () => {
    setVideoDims(null)
    setFacecamMediaId(null)
    setFacecamDetecting(false)
    setFacecamCrop(null)
    setFacecamConfidence(null)
    setFacecamError('')
  }

  const detectFacecam = async (file: File, templateId: string) => {
    setFacecamDetecting(true)
    setFacecamError('')
    setFacecamCrop(null)
    setFacecamConfidence(null)
    try {
      const formData = new FormData()
      formData.append('templateId', templateId)
      formData.append('mediaFile', file)
      const res = await fetch('/api/template/detect-facecam', { method: 'POST', body: formData })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || 'Falha ao detectar facecam')

      setFacecamMediaId(body.mediaId)
      if (body.videoWidth && body.videoHeight) {
        setVideoDims({ width: body.videoWidth, height: body.videoHeight })
      }

      if (body.detected && body.region) {
        setFacecamCrop({ ...body.region, source: 'auto' })
        setFacecamConfidence(body.confidence)
      } else if (body.videoWidth && body.videoHeight) {
        // Seed a manual default (bottom-right corner, 25% size) so the form
        // is never empty even when auto-detection doesn't find anything —
        // this counts as 'manual' from the start since it wasn't detected.
        const w = Math.round(body.videoWidth * 0.25)
        const h = Math.round(body.videoHeight * 0.25)
        setFacecamCrop({ x: body.videoWidth - w, y: body.videoHeight - h, width: w, height: h, source: 'manual' })
      }
    } catch (err: any) {
      setFacecamError(err.message || 'Falha ao detectar facecam automaticamente — ajuste manualmente abaixo')
    } finally {
      setFacecamDetecting(false)
    }
  }

  const onMediaChange = (file: File | null) => {
    setMediaFile(file)
    setResult(null)
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaPreviewUrl(file ? URL.createObjectURL(file) : null)
    resetFacecamState()

    if (file && template && template.regions.length === 2 && file.type.startsWith('video/')) {
      detectFacecam(file, template.templateId)
    }
  }

  // Editing a field makes the manual crop authoritative from then on — it is
  // never recalculated or overwritten by auto-detection again for this video.
  const updateFacecamField = (field: 'x' | 'y' | 'width' | 'height', value: number) => {
    setFacecamCrop((prev) => (prev ? { ...prev, [field]: Math.max(0, Math.round(value)), source: 'manual' } : prev))
  }

  const generate = async () => {
    if (!mediaFile) return
    if (mode === 'template' && !template) return
    if (mode === 'template' && needsFacecamSplit && !facecamCrop) return
    setGenerating(true)
    setProgress(0)
    setError('')
    setResult(null)
    try {
      const formData = new FormData()

      if (mode === 'original') {
        formData.append('original', 'true')
        formData.append('mediaFile', mediaFile)
        const body = await xhrUpload('/api/template/generate', formData, setProgress)
        setResult(body)
        if (autoSchedule && body.mediaType === 'video') setSchedulePlatform('INSTAGRAM_REELS')
        return
      }

      formData.append('templateId', template!.templateId)

      if (needsFacecamSplit && facecamCrop) {
        // Media was already uploaded once during facecam detection — reuse
        // it by id instead of uploading the (potentially large) file again.
        // facecamCrop is sent exactly as-is, whether its source is 'auto' or
        // 'manual' — this is the single value that produced the preview too.
        if (facecamMediaId) formData.append('mediaId', facecamMediaId)
        else formData.append('mediaFile', mediaFile)
        const { x, y, width, height } = facecamCrop
        formData.append('facecamRegion', JSON.stringify({ x, y, width, height }))
      } else {
        formData.append('mediaFile', mediaFile)
        formData.append('regionIndex', String(selectedRegion))
      }

      const body = await xhrUpload('/api/template/generate', formData, setProgress)
      setResult(body)
      if (autoSchedule && body.mediaType === 'video') setSchedulePlatform('INSTAGRAM_REELS')
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar a arte')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Modo: encaixar num template ou usar a mídia do jeito que está */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => setMode('template')}
          className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
            mode === 'template' ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3 hover:bg-white/6 text-white/60'
          }`}
        >
          Colocar template
        </button>
        <button
          onClick={() => setMode('original')}
          className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
            mode === 'original' ? 'border-violet-500 bg-violet-500/15' : 'border-white/10 bg-white/3 hover:bg-white/6 text-white/60'
          }`}
        >
          Manter original
        </button>
      </div>

      {/* Template preview + detected regions */}
      {mode === 'template' && (
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">1. Template</h2>
          <button
            onClick={() => templateInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Trocar template
          </button>
          <input
            ref={templateInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && loadTemplate(e.target.files[0])}
          />
        </div>

        {template?.reused && (
          <p className="text-xs text-violet-300/70 -mt-2 mb-3">Usando o template da última vez</p>
        )}

        {loadingTemplate ? (
          <div className="aspect-[9/16] max-w-xs mx-auto rounded-xl bg-white/5 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : template ? (
          <>
            <div
              className="relative mx-auto rounded-xl overflow-hidden max-w-xs"
              style={{ aspectRatio: `${template.width} / ${template.height}` }}
            >
              <img src={template.previewUrl} alt="Template" className="w-full h-full object-contain" />
              {template.regions.map((r) => (
                <div
                  key={r.index}
                  className={`absolute border-2 rounded transition-colors ${
                    selectedRegion === 'all' || selectedRegion === r.index
                      ? 'border-violet-400 bg-violet-500/20'
                      : 'border-white/30 bg-white/5'
                  }`}
                  style={{
                    left: `${(r.x / template.width) * 100}%`,
                    top: `${(r.y / template.height) * 100}%`,
                    width: `${(r.width / template.width) * 100}%`,
                    height: `${(r.height / template.height) * 100}%`,
                  }}
                />
              ))}
            </div>

            {needsFacecamSplit ? (
              <p className="text-xs text-violet-300/70 text-center mt-3">
                2 áreas detectadas — a maior recebe o vídeo principal, a menor recebe a facecam automaticamente
              </p>
            ) : (
              <>
                {template.regions.length > 1 && (
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {template.regions.map((r) => (
                      <button
                        key={r.index}
                        onClick={() => setSelectedRegion(r.index)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          selectedRegion === r.index ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
                        }`}
                      >
                        Área {r.index + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedRegion('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedRegion === 'all' ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      Preencher todas
                    </button>
                  </div>
                )}
                <p className="text-xs text-white/30 text-center mt-3">
                  {template.regions.length} área{template.regions.length !== 1 ? 's' : ''} azul detectada
                  {template.regions.length !== 1 ? 's' : ''}
                </p>
              </>
            )}
          </>
        ) : null}
      </div>
      )}

      {/* Media upload */}
      <div className="glass rounded-2xl p-5">
        <h2 className="font-semibold text-sm mb-4">{mode === 'template' ? '2.' : '1.'} Enviar foto ou vídeo</h2>
        {mode === 'original' && (
          <p className="text-xs text-white/30 -mt-2 mb-3">
            A mídia enviada é usada do jeito que está, sem encaixar em nenhuma moldura.
          </p>
        )}
        <div
          onClick={() => mediaInputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-white/10 hover:border-violet-500/30 hover:bg-white/2 transition-all cursor-pointer p-8 text-center"
        >
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => onMediaChange(e.target.files?.[0] || null)}
          />
          {mediaFile ? (
            <div className="flex items-center justify-center gap-3">
              <ImageIcon className="w-8 h-8 text-violet-400" />
              <div className="text-left">
                <p className="font-medium text-sm truncate max-w-[240px]">{mediaFile.name}</p>
                <p className="text-xs text-white/40">{(mediaFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-white/30 mx-auto mb-2" />
              <p className="text-sm text-white/50">Clique para enviar uma foto ou vídeo</p>
            </>
          )}
        </div>
      </div>

      {/* Facecam detection + manual adjustment */}
      {mode === 'template' && needsFacecamSplit && mediaFile && mediaPreviewUrl && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-violet-400" />
            <h2 className="font-semibold text-sm">Facecam</h2>
          </div>

          {facecamDetecting && (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              Detectando facecam automaticamente...
            </div>
          )}

          {!facecamDetecting && facecamCrop?.source === 'auto' && facecamConfidence !== null && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Fonte: detecção automática ({Math.round(facecamConfidence * 100)}% de confiança)
            </div>
          )}

          {!facecamDetecting && facecamCrop?.source === 'manual' && (
            <p className="text-sm text-yellow-400/90">
              Fonte: recorte manual — usado exatamente como preenchido abaixo, sem nova detecção automática.
            </p>
          )}

          {facecamError && <p className="text-sm text-red-400">{facecamError}</p>}

          {videoDims && facecamCrop && (
            <div
              className="relative mx-auto rounded-xl overflow-hidden max-w-xs bg-black/40"
              style={{ aspectRatio: `${videoDims.width} / ${videoDims.height}` }}
            >
              <video src={mediaPreviewUrl} muted className="w-full h-full object-contain" />
              <div
                className="absolute border-2 border-violet-400 bg-violet-500/20 pointer-events-none"
                style={{
                  left: `${(facecamCrop.x / videoDims.width) * 100}%`,
                  top: `${(facecamCrop.y / videoDims.height) * 100}%`,
                  width: `${(facecamCrop.width / videoDims.width) * 100}%`,
                  height: `${(facecamCrop.height / videoDims.height) * 100}%`,
                }}
              />
            </div>
          )}

          {facecamCrop && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-white/40">
                X (px)
                <input
                  type="number"
                  value={facecamCrop.x}
                  onChange={(e) => updateFacecamField('x', Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
              <label className="text-xs text-white/40">
                Y (px)
                <input
                  type="number"
                  value={facecamCrop.y}
                  onChange={(e) => updateFacecamField('y', Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
              <label className="text-xs text-white/40">
                Largura (px)
                <input
                  type="number"
                  value={facecamCrop.width}
                  onChange={(e) => updateFacecamField('width', Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
              <label className="text-xs text-white/40">
                Altura (px)
                <input
                  type="number"
                  value={facecamCrop.height}
                  onChange={(e) => updateFacecamField('height', Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Generate */}
      <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer -mb-2.5">
        <input
          type="checkbox"
          checked={autoSchedule}
          onChange={(e) => setAutoSchedule(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-violet-500 cursor-pointer"
        />
        Abrir agendamento no Instagram assim que gerar
      </label>
      <button
        onClick={generate}
        disabled={
          !mediaFile || generating || (mode === 'template' && (!template || facecamDetecting || (needsFacecamSplit && !facecamCrop)))
        }
        className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all flex items-center justify-center gap-2"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {generating
          ? `${mode === 'template' ? 'Encaixando' : 'Processando'}... ${progress}%`
          : mode === 'template' ? 'Encaixar automaticamente' : 'Usar vídeo original'}
      </button>

      {/* Result */}
      {result && (
        <div className="glass rounded-2xl p-5">
          <h2 className="font-semibold text-sm mb-4">{mode === 'template' ? '3.' : '2.'} Resultado</h2>
          <div
            className="relative mx-auto rounded-xl overflow-hidden max-w-xs bg-black/30"
            style={{ aspectRatio: mode === 'template' && template ? `${template.width} / ${template.height}` : '9 / 16' }}
          >
            {result.mediaType === 'video' ? (
              <video src={result.outputUrl} controls autoPlay loop muted className="w-full h-full object-contain" />
            ) : (
              <img src={result.outputUrl} alt="Resultado" className="w-full h-full object-contain" />
            )}
          </div>
          <a
            href={result.outputUrl}
            download
            className="mt-4 w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Baixar
          </a>

          {/* Editar/legendar e agendar só fazem sentido pra vídeo — legendas
              vêm de áudio e a publicação aqui é sempre Reels/Shorts (vídeo). */}
          {result.mediaType === 'video' && (
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <Link
                href={`/template-outputs/${result.templateOutputId}/editor`}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 font-medium transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar no Editor
              </Link>
              <button
                onClick={() => setSchedulePlatform('INSTAGRAM_REELS')}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 font-medium transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Instagram className="w-3.5 h-3.5" />
                Agendar Instagram
              </button>
              <button
                onClick={() => setSchedulePlatform('YOUTUBE_SHORTS')}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 font-medium transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Youtube className="w-3.5 h-3.5" />
                Agendar YouTube
              </button>
            </div>
          )}
        </div>
      )}

      {schedulePlatform && result && (
        <ScheduleModal
          sourceType="TEMPLATE_OUTPUT"
          sourceId={result.templateOutputId}
          defaultPlatform={schedulePlatform}
          downloadUrl={result.outputUrl}
          onClose={() => setSchedulePlatform(null)}
        />
      )}
    </div>
  )
}
