import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'
import type { TextOverlay, CaptionSegment, CaptionStyle, Effect, FontFamilyId, SplitLayoutMode, SplitLayoutConfig, VideoTransform, EditorLayer, LayerTransform } from '@/types'

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH)

// Um deploy pode trocar o container bem no instante em que um job de
// renderização começa a rodar — o volume persistente às vezes leva um
// instante para ficar visível de novo no container novo logo após a troca.
// Antes de desistir com "arquivo não encontrado", espera um pouco e checa
// de novo, em vez de falhar na primeira tentativa.
async function waitForFile(filePath: string, retries = 4, delayMs = 3000): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (fs.existsSync(filePath)) return true
    if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps: number
  bitrate: number
  hasAudio: boolean
}

export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err)
      const video = data.streams.find((s) => s.codec_type === 'video')
      const hasAudio = data.streams.some((s) => s.codec_type === 'audio')
      const duration = data.format.duration ?? 0
      resolve({
        duration: Number(duration),
        width: video?.width ?? 0,
        height: video?.height ?? 0,
        fps: eval(video?.r_frame_rate ?? '30') || 30,
        bitrate: Number(data.format.bit_rate ?? 0),
        hasAudio,
      })
    })
  })
}

// Lightweight single-frame JPEG for list previews — isolated from renderClip,
// never touches the clip-export pipeline.
export function generateThumbnail(videoPath: string, outputPath: string, atSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(Math.max(0, atSeconds))
      .outputOptions(['-frames:v', '1', '-q:v', '4', '-update', '1'])
      .videoFilter('scale=480:-2')
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

// Crops a sub-rectangle out of a video (e.g. an embedded facecam corner)
// into its own silent, 30fps-normalized file — isolated from renderClip,
// only used by the template studio's facecam auto-split feature.
export function cropVideoRegion(videoPath: string, outputPath: string, region: CropRegion): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      reject(new Error(`Arquivo de vídeo não encontrado: ${videoPath}`))
      return
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    // H.264/yuv420p requires even width/height.
    const w = Math.max(2, Math.floor(region.width / 2) * 2)
    const h = Math.max(2, Math.floor(region.height / 2) * 2)
    const x = Math.max(0, Math.round(region.x))
    const y = Math.max(0, Math.round(region.y))

    const stderrLines: string[] = []
    let settled = false

    const command = ffmpeg(videoPath)
      .noAudio()
      .videoFilter(`crop=${w}:${h}:${x}:${y},fps=30`)
      .videoCodec('libx264')
      .outputOptions(['-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr'])
      .output(outputPath)

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }

    command.on('start', (commandLine) => {
      console.log(`[ffmpeg] recorte de facecam — comando: ${commandLine}`)
    })
    command.on('stderr', (line) => stderrLines.push(line))
    command.on('end', () => {
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        finish(new Error(`Recorte de facecam gerou arquivo vazio ou ausente: ${outputPath}`))
        return
      }
      finish()
    })
    command.on('error', (err) => {
      const detail = stderrLines.slice(-20).join('\n')
      finish(new Error(`Falha ao recortar facecam: ${err.message}${detail ? `\n${detail}` : ''}`))
    })

    command.run()
  })
}

// Extrai UM frame (perto do meio do corte, mais chance de estar "no ar" que
// o frame 0) já cropado pela facecamRegion (0-1 normalizado) — usado pelo
// botão "Testar recorte da facecam" no editor, pra confirmar visualmente
// que a região está certa ANTES de rodar o render inteiro (que só se nota
// o erro depois de esperar o vídeo inteiro processar).
export async function previewFacecamCrop(
  videoPath: string,
  region: { x: number; y: number; width: number; height: number },
  atSeconds: number,
  outputPath: string
): Promise<void> {
  const meta = await getVideoMetadata(videoPath)
  const srcW = meta.width || 1920
  const srcH = meta.height || 1080
  const w = Math.max(2, Math.floor((region.width * srcW) / 2) * 2)
  const h = Math.max(2, Math.floor((region.height * srcH) / 2) * 2)
  const x = Math.min(srcW - w, Math.max(0, Math.round(region.x * srcW)))
  const y = Math.min(srcH - h, Math.max(0, Math.round(region.y * srcH)))

  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    ffmpeg(videoPath)
      .seekInput(Math.max(0, atSeconds))
      .outputOptions(['-frames:v', '1', '-q:v', '3', '-update', '1'])
      .videoFilter(`crop=${w}:${h}:${x}:${y}`)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

// Extrai UM frame já com o layout split-screen (facecam+principal) REAL
// aplicado — reaproveita buildSplitLayoutFilters, o MESMO grafo de filtro
// usado no render final, então isso não é uma aproximação visual: é
// pixel-a-pixel o que vai sair no vídeo renderizado (só que 1 frame em vez
// do vídeo inteiro). Usado pelo botão "Ver layout completo" no editor —
// antes só existia o preview isolado da facecam (previewFacecamCrop), sem
// nada mostrando os dois painéis já compostos juntos.
export async function previewSplitLayoutFrame(
  videoPath: string,
  mode: SplitLayoutMode,
  config: SplitLayoutConfig,
  canvasW: number,
  canvasH: number,
  atSeconds: number,
  outputPath: string
): Promise<void> {
  const srcMeta = await getVideoMetadata(videoPath)
  const filters = buildSplitLayoutFilters(mode, config, canvasW, canvasH, srcMeta.width || canvasW, srcMeta.height || canvasH)

  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    ffmpeg(videoPath)
      .seekInput(Math.max(0, atSeconds))
      .complexFilter(filters, 'outv')
      .outputOptions(['-frames:v', '1', '-q:v', '3', '-update', '1'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

const DEFAULT_FFMPEG_TIMEOUT_MS = 15 * 60 * 1000 // 15min — audio-only encode, generous safety margin

// Shared hardened runner for audio extraction: validates the input exists,
// ensures the output dir exists, logs the exact command + paths, captures
// stderr for real error messages, enforces a timeout (kills the ffmpeg
// process instead of hanging forever), and verifies the output file is
// non-empty before resolving. Used only by extractAudio/extractAudioMp3 —
// does not touch renderClip or the clip-export pipeline.
function runFfmpegExtraction(
  videoPath: string,
  outputPath: string,
  build: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand,
  timeoutMs: number = DEFAULT_FFMPEG_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      reject(new Error(`Arquivo de vídeo não encontrado: ${videoPath}`))
      return
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    const stderrLines: string[] = []
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const command = build(ffmpeg(videoPath)).output(outputPath)

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }

    command.on('start', (commandLine) => {
      console.log(`[ffmpeg] extração de áudio — comando: ${commandLine}`)
      console.log(`[ffmpeg] input: ${videoPath}`)
      console.log(`[ffmpeg] output: ${outputPath}`)
    })

    command.on('stderr', (line) => {
      stderrLines.push(line)
    })

    command.on('end', () => {
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        finish(new Error(`Extração de áudio gerou arquivo vazio ou ausente: ${outputPath}`))
        return
      }
      console.log(`[ffmpeg] áudio extraído com sucesso: ${outputPath} (${fs.statSync(outputPath).size} bytes)`)
      finish()
    })

    command.on('error', (err) => {
      const detail = stderrLines.slice(-20).join('\n')
      finish(new Error(`Falha ao extrair áudio: ${err.message}${detail ? `\n${detail}` : ''}`))
    })

    timer = setTimeout(() => {
      console.error(`[ffmpeg] timeout de ${timeoutMs}ms atingido na extração de áudio — encerrando processo`)
      command.kill('SIGKILL')
      finish(new Error(`Timeout: extração de áudio não terminou em ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    command.run()
  })
}

export function extractAudio(videoPath: string, outputPath: string, timeoutMs?: number): Promise<void> {
  return runFfmpegExtraction(
    videoPath,
    outputPath,
    (cmd) => cmd.noVideo().audioCodec('pcm_s16le').audioFrequency(16000).audioChannels(1),
    timeoutMs
  )
}

export function extractAudioMp3(videoPath: string, outputPath: string, timeoutMs?: number): Promise<void> {
  return runFfmpegExtraction(
    videoPath,
    outputPath,
    (cmd) => cmd.noVideo().audioCodec('libmp3lame').audioBitrate('128k').audioFrequency(16000).audioChannels(1),
    timeoutMs
  )
}

// Usada só pelo editor: extrai o áudio de um trecho (o clipe), não do vídeo
// inteiro — arquivo pequeno, resposta rápida do Whisper, e os timestamps que
// voltam já nascem relativos ao início do clipe (0-based), exatamente o que
// EditorState espera.
export function extractAudioRangeMp3(
  videoPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  timeoutMs?: number
): Promise<void> {
  return runFfmpegExtraction(
    videoPath,
    outputPath,
    (cmd) =>
      cmd
        .seekInput(Math.max(0, startTime))
        .duration(Math.max(0.1, duration))
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(16000)
        .audioChannels(1),
    timeoutMs
  )
}

export interface RenderClipOptions {
  inputPath: string
  outputPath: string
  startTime: number
  duration: number
  format: 'ORIGINAL' | 'VERTICAL_9_16' | 'SQUARE_1_1' | 'HORIZONTAL_16_9' | 'FEED_4_5'
  // How the source fits into the target canvas — ignored when format is
  // 'ORIGINAL' (which never crops/pads/zooms by definition). Defaults to
  // 'CONTAIN' (never crops content, may add black bars).
  fitMode?: 'CONTAIN' | 'COVER' | 'BLUR_BACKGROUND'
  // 'clean' (default) burns in nothing — no title, no caption, no box, no
  // subtitles filter. 'captioned' opts back into the old drawtext overlay
  // behavior. Legends are otherwise stored in the DB and applied manually
  // in CapCut, never burned into the render.
  exportMode?: 'clean' | 'captioned'
  caption?: string
  title?: string
  // Estado do editor (src/types EditorState) — quando presente, é queimado no
  // vídeo por cima de qualquer caption/title de exportMode 'captioned'.
  // Independente de exportMode: um clipe editado sempre aplica seus overlays,
  // legendas e efeitos, porque foi um ato explícito do usuário no editor.
  editorOverlays?: TextOverlay[]
  editorCaptions?: CaptionSegment[]
  editorCaptionStyle?: CaptionStyle
  editorEffects?: Effect[]
  // Presente = layout split-screen (facecam), sobrepõe/ignora fitMode —
  // ver buildSplitLayoutFilters. Ausente = comportamento normal de sempre.
  layoutMode?: SplitLayoutMode
  layoutConfig?: SplitLayoutConfig
  // Zoom/posição manual do vídeo principal (mecanismo legado, pré-camadas) —
  // sobrepõe fitMode (vira um "COVER" com zoom extra e ponto de corte
  // deslocado). Ignorado quando hasSplitLayout está ativo, ou quando `layers`
  // abaixo já tem uma camada VIDEO (essa tem prioridade).
  transform?: VideoTransform
  // Sistema de camadas — Etapa 1 só olha pra camada `type: 'VIDEO'` (se
  // existir, seu transform tem prioridade sobre o `transform` legado acima).
  layers?: EditorLayer[]
  onProgress?: (progress: number) => void
}

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  VERTICAL_9_16:  { width: 1080, height: 1920 },
  SQUARE_1_1:     { width: 1080, height: 1080 },
  HORIZONTAL_16_9:{ width: 1920, height: 1080 },
  FEED_4_5:       { width: 1080, height: 1350 },
}

// Teto de resolução para o formato ORIGINAL — fontes acima disso (4K, 8K)
// são reduzidas pra caber aqui (mantendo aspect ratio). Decodificar+codificar
// nativo em 4K já causou SIGKILL (OOM) num container de 1GB.
const MAX_ORIGINAL_WIDTH = 1920
const MAX_ORIGINAL_HEIGHT = 1080

// Zoom/posição manual do vídeo principal — generaliza o "cover crop" que o
// fitMode COVER já faz (scale increase + crop centralizado): em zoom=1 e
// position=0,0 o resultado é idêntico ao COVER de hoje. zoom>1 escala o
// alvo do "increase" além do canvas (mais imagem fica disponível depois do
// crop) e positionX/Y desloca o ponto do crop dentro dessa folga, em vez de
// sempre pegar o centro.
function buildTransformFilter(
  t: VideoTransform,
  canvasW: number,
  canvasH: number
): string[] {
  const zoom = Math.max(1, t.zoom)
  const targetW = Math.round(canvasW * zoom / 2) * 2
  const targetH = Math.round(canvasH * zoom / 2) * 2

  // x/y do crop usam expressões do próprio ffmpeg (in_w/in_h = dimensão real
  // que SAIU do scale acima) em vez de um valor pré-calculado em JS — o
  // "force_original_aspect_ratio=increase" arredonda internamente do jeito
  // dele, e um offset fixo calculado à parte podia ficar levemente
  // diferente da largura/altura real, estourando os limites do crop.
  // halfX/halfY viram 0 (extremo esquerdo/topo) a 1 (extremo direito/base).
  const halfX = (1 + Math.min(1, Math.max(-1, t.positionX))) / 2
  const halfY = (1 + Math.min(1, Math.max(-1, t.positionY))) / 2

  return [
    'fps=30',
    `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${canvasW}:${canvasH}:(in_w-${canvasW})*${halfX.toFixed(4)}:(in_h-${canvasH})*${halfY.toFixed(4)}`,
    'format=yuv420p',
  ]
}

// Crop manual da camada VIDEO (recorta a fonte ANTES do zoom/pan de
// buildTransformFilter) — pixels pré-calculados em JS, seguro aqui porque é
// o PRIMEIRO filtro da cadeia (opera sobre o frame cru decodificado, então
// não há nenhum scale anterior cujo arredondamento poderia divergir da conta
// em JS) — mesmo raciocínio já usado no crop de facecam de buildSplitLayoutFilters.
function buildLayerCropFilter(t: LayerTransform, srcW: number, srcH: number): string[] {
  const w = Math.max(2, Math.round((t.cropWidth * srcW) / 2) * 2)
  const h = Math.max(2, Math.round((t.cropHeight * srcH) / 2) * 2)
  const x = Math.min(srcW - w, Math.max(0, Math.round(t.cropX * srcW)))
  const y = Math.min(srcH - h, Math.max(0, Math.round(t.cropY * srcH)))
  return [`crop=${w}:${h}:${x}:${y}`]
}

// Empilha duas regiões do MESMO vídeo fonte uma em cima da outra (layout
// split-screen com facecam) — canvasW/canvasH é o tamanho final de saída,
// srcW/srcH é o tamanho do vídeo fonte (facecamRegion é relativo a ele).
// Usa vstack em vez de overlay (like BLUR_BACKGROUND) porque é só empilhar
// verticalmente, sem posicionamento x/y entre os dois painéis.
function buildSplitLayoutFilters(
  mode: SplitLayoutMode,
  config: SplitLayoutConfig,
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number
): ffmpeg.FilterSpecification[] {
  // Validação antes de montar o filtro — uma facecamRegion ausente/zerada/
  // fora dos limites do vídeo fonte gera um crop degenerado (ou o ffmpeg
  // clampeando pra algo sem sentido) em vez de um erro claro. Visto na
  // prática: uma detecção automática errada não é pega por nenhuma
  // validação, só produz um recorte visualmente errado sem avisar.
  const r = config.facecamRegion
  const regionValid =
    r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.width) && Number.isFinite(r.height) &&
    r.width > 0 && r.height > 0 &&
    r.x >= 0 && r.y >= 0 && r.x + r.width <= 1.001 && r.y + r.height <= 1.001
  if (!regionValid) {
    throw new Error('Área da facecam inválida. Ajuste manualmente a região da câmera.')
  }

  // Log seguro (sem secrets) pra depurar esse tipo de caso sem precisar
  // consultar o banco toda vez — só dimensões/configuração, nunca tokens.
  console.log('[ffmpeg] layout split-screen:', JSON.stringify({
    layoutMode: mode,
    videoWidth: srcW,
    videoHeight: srcH,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    facecamRegion: config.facecamRegion,
    facecamZoom: config.facecamZoom,
    splitRatio: config.splitRatio,
  }))

  const OUTPUT_FPS = 30
  // Par por construção: floor(par/2)*2 já é par, e a subtração de dois
  // pares sempre dá par — garante que os dois painéis somam exatamente
  // canvasH (vstack exige que a soma das alturas bata com o esperado).
  const topHeight = Math.max(2, Math.floor((canvasH * config.splitRatio) / 2) * 2)
  const bottomHeight = canvasH - topHeight

  // Zoom embutido num único crop (não dois) — corta um sub-retângulo menor
  // e centralizado dentro da região da facecam, depois escala pra encher o
  // painel. zoom <1 não faz sentido (nunca cropar além da região original).
  const zoom = Math.max(1, config.facecamZoom)
  const fcX = Math.round(config.facecamRegion.x * srcW)
  const fcY = Math.round(config.facecamRegion.y * srcH)
  const fcW = Math.max(2, Math.round(config.facecamRegion.width * srcW))
  const fcH = Math.max(2, Math.round(config.facecamRegion.height * srcH))
  const cropW = Math.max(2, Math.round(fcW / zoom))
  const cropH = Math.max(2, Math.round(fcH / zoom))
  const cropX = Math.min(srcW - cropW, Math.max(0, Math.round(fcX + (fcW - cropW) / 2)))
  const cropY = Math.min(srcH - cropH, Math.max(0, Math.round(fcY + (fcH - cropH) / 2)))

  // Mesma matemática pro painel PRINCIPAL — ausente (configs salvas antes
  // dessa opção existir) cai no frame inteiro sem zoom, resultado idêntico
  // ao comportamento de sempre (o crop vira um no-op: recorta o próprio
  // tamanho do frame, na posição 0,0).
  const mainRegion = config.mainRegion ?? { x: 0, y: 0, width: 1, height: 1 }
  const mainZoom = Math.max(1, config.mainZoom ?? 1)
  const mX = Math.round(mainRegion.x * srcW)
  const mY = Math.round(mainRegion.y * srcH)
  const mW = Math.max(2, Math.round(mainRegion.width * srcW))
  const mH = Math.max(2, Math.round(mainRegion.height * srcH))
  const mCropW = Math.max(2, Math.round(mW / mainZoom))
  const mCropH = Math.max(2, Math.round(mH / mainZoom))
  const mCropX = Math.min(srcW - mCropW, Math.max(0, Math.round(mX + (mW - mCropW) / 2)))
  const mCropY = Math.min(srcH - mCropH, Math.max(0, Math.round(mY + (mH - mCropH) / 2)))

  const isFacecamTop = mode === 'FACECAM_TOP_MAIN_BOTTOM'
  const mainPanelHeight = isFacecamTop ? bottomHeight : topHeight
  const facecamPanelHeight = isFacecamTop ? topHeight : bottomHeight

  console.log('[ffmpeg] layout split-screen — crop calculado (pixels no vídeo fonte):', JSON.stringify({
    facecamCropPx: { x: cropX, y: cropY, width: cropW, height: cropH },
    mainCropPx: { x: mCropX, y: mCropY, width: mCropW, height: mCropH },
    topHeight, bottomHeight, isFacecamTop,
  }))

  const filters: ffmpeg.FilterSpecification[] = [
    { filter: 'fps', options: `fps=${OUTPUT_FPS}`, inputs: '0:v', outputs: 'v30' },
    // 'v30' precisa alimentar DOIS ramos (painel principal e painel da
    // facecam) — um split explícito, em vez de contar com o ffmpeg
    // auto-duplicar um label consumido duas vezes. Builds mais antigos de
    // ffmpeg (ex.: o do container de produção, via apt) não fazem esse
    // auto-split e falham com "Invalid stream specifier" — visto na prática.
    { filter: 'split', options: '2', inputs: 'v30', outputs: ['v30main', 'v30fc'] },
    // Painel "principal": crop já com zoom/posição embutidos (igual a
    // facecam), depois cover-crop pra preencher W x altura do painel.
    { filter: 'crop', options: `${mCropW}:${mCropH}:${mCropX}:${mCropY}`, inputs: 'v30main', outputs: 'mainCropped' },
    { filter: 'scale', options: `${canvasW}:${mainPanelHeight}:force_original_aspect_ratio=increase:flags=lanczos`, inputs: 'mainCropped', outputs: 'mainScaled' },
    { filter: 'crop', options: `${canvasW}:${mainPanelHeight}`, inputs: 'mainScaled', outputs: 'mainPanel' },
    // Painel "facecam": crop já com zoom embutido, depois cover-crop pra preencher W x altura do painel.
    { filter: 'crop', options: `${cropW}:${cropH}:${cropX}:${cropY}`, inputs: 'v30fc', outputs: 'fcCropped' },
    { filter: 'scale', options: `${canvasW}:${facecamPanelHeight}:force_original_aspect_ratio=increase:flags=lanczos`, inputs: 'fcCropped', outputs: 'fcScaled' },
    { filter: 'crop', options: `${canvasW}:${facecamPanelHeight}`, inputs: 'fcScaled', outputs: 'facecamPanel' },
  ]

  filters.push({
    filter: 'vstack',
    options: 'inputs=2',
    inputs: isFacecamTop ? ['facecamPanel', 'mainPanel'] : ['mainPanel', 'facecamPanel'],
    outputs: 'stacked',
  })
  filters.push({ filter: 'format', options: 'yuv420p', inputs: 'stacked', outputs: 'outv' })

  return filters
}

// drawtext resolves fonts through Fontconfig by default, which isn't
// configured on plain Windows ffmpeg builds ("Cannot load default config
// file"). Pointing fontfile= at a real font file bypasses Fontconfig entirely.
//
// Cada família tem sua própria lista de candidatos (caminho real no
// container Linux via apt — ver Dockerfile — e um equivalente do Windows,
// pra funcionar em dev local também). FFMPEG_FONT_PATH continua valendo só
// pra 'dejavu-sans' (override manual do caso sem nenhum pacote instalado).
const FONT_CANDIDATES: Record<FontFamilyId, string[]> = {
  'dejavu-sans': [
    process.env.FFMPEG_FONT_PATH,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ].filter(Boolean) as string[],
  'liberation-sans': [
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
  ],
  'liberation-serif': [
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    'C:/Windows/Fonts/timesbd.ttf',
  ],
  freemono: [
    '/usr/share/fonts/truetype/freefont/FreeMonoBold.ttf',
    'C:/Windows/Fonts/courbd.ttf',
  ],
}

const cachedFontPaths = new Map<FontFamilyId, string | null>()

function resolveFontPath(fontFamily?: FontFamilyId): string | null {
  const family = fontFamily && FONT_CANDIDATES[fontFamily] ? fontFamily : 'dejavu-sans'
  if (cachedFontPaths.has(family)) return cachedFontPaths.get(family)!

  let resolved = FONT_CANDIDATES[family].find((p) => fs.existsSync(p)) ?? null
  // Família pedida não tem nenhum arquivo instalado — cai pro padrão em vez
  // de simplesmente não desenhar texto nenhum.
  if (!resolved && family !== 'dejavu-sans') {
    resolved = resolveFontPath('dejavu-sans')
  }
  cachedFontPaths.set(family, resolved)
  return resolved
}

function escapeFontPathForFilter(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

// Wraps text into multiple lines so drawtext never renders it wider than the
// frame (which is what was causing captions to appear "cut off" at the edges).
function wrapTextForWidth(text: string, frameWidth: number, fontSize: number): string {
  const maxCharsPerLine = Math.max(10, Math.floor((frameWidth * 0.9) / (fontSize * 0.55)))
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  // A real newline byte inside the quoted text is what drawtext treats as a
  // line break — the two-character sequence "\n" is parsed as a literal "n".
  return lines
    .map((line) => line.replace(/'/g, "\\'").replace(/:/g, '\\:'))
    .join('\n')
}

export async function renderClip(opts: RenderClipOptions): Promise<void> {
  const {
    inputPath, outputPath, startTime, duration, format, exportMode = 'clean', caption, title,
    editorOverlays, editorCaptions, editorCaptionStyle, editorEffects, onProgress,
  } = opts
  const fitMode = opts.fitMode || 'CONTAIN'

  if (!(await waitForFile(inputPath))) {
    throw new Error(`Arquivo de vídeo não encontrado: ${inputPath}`)
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  const OUTPUT_FPS = 30
  const GOP = OUTPUT_FPS * 2 // keyframe a cada 2s — evita GOPs longos que deixam o playback/seek engasgado
  const isOriginal = format === 'ORIGINAL'

  // Two construction paths: a simple single -vf chain (ORIGINAL, COVER,
  // CONTAIN) or a -filter_complex graph (BLUR_BACKGROUND, which needs two
  // derived copies of the source composited together).
  let vfFilters: string[] = []
  let complexFilters: ffmpeg.FilterSpecification[] | null = null
  let finalVideoLabel = 'outv'

  // Layout split-screen (facecam) sobrepõe completamente o branch normal de
  // format/fitMode abaixo — a construção de verdade acontece logo depois de
  // getFrameSize() ser definida (algumas linhas abaixo), porque precisa
  // conhecer as dimensões do canvas de saída antes de montar o filtro.
  const hasSplitLayout = !!(opts.layoutMode && opts.layoutConfig)

  // Camada VIDEO (sistema de camadas novo) tem prioridade sobre o `transform`
  // legado quando existir — os dois representam o mesmo conceito (zoom/pan
  // de cover-fill), só que a camada é a fonte de verdade uma vez que o corte
  // foi aberto no editor novo. Convertido pro mesmo formato do transform
  // legado pra reaproveitar buildTransformFilter sem duplicar lógica.
  const videoLayer = opts.layers?.find((l) => l.type === 'VIDEO')
  const effective: VideoTransform | undefined = videoLayer
    ? {
        zoom: Math.min(4, Math.max(1, videoLayer.transform.scale)),
        positionX: Math.min(1, Math.max(-1, videoLayer.transform.x)),
        positionY: Math.min(1, Math.max(-1, videoLayer.transform.y)),
      }
    : opts.transform

  // Zoom/posição — só ativa quando difere de fato do padrão (evita trabalho
  // extra no caminho comum sem transform). Funciona mesmo com format
  // 'ORIGINAL' (TemplateOutput sempre usa 'ORIGINAL') — getFrameSize() já
  // resolve o canvas certo (dimensão nativa da fonte) nesse caso, então
  // zoom/posição vira "aproximar mantendo a mesma resolução de saída".
  const hasTransform =
    !hasSplitLayout && !!effective &&
    (effective.zoom > 1.001 || Math.abs(effective.positionX) > 0.001 || Math.abs(effective.positionY) > 0.001)

  // Crop manual da camada VIDEO (recorta a fonte ANTES do zoom/pan acima) —
  // só existe no sistema de camadas novo, sem equivalente no `transform`
  // legado.
  const cropSrc = videoLayer?.transform
  const hasCrop = !hasSplitLayout && !!cropSrc && (
    cropSrc.cropX > 0.001 || cropSrc.cropY > 0.001 ||
    cropSrc.cropWidth < 0.999 || cropSrc.cropHeight < 0.999
  )

  if (hasSplitLayout || hasTransform || hasCrop) {
    // placeholder — sobrescrito abaixo, depois que getFrameSize existir.
  } else if (isOriginal) {
    // Keeps the source aspect ratio untouched — no crop, no zoom. Fontes
    // acima de 1080p (ex. 4K) SÃO reduzidas: decodificar+codificar em 4K
    // puro já matou o worker com SIGKILL (OOM) num container de 1GB, mesmo
    // com preset mais leve — o pico de memória escala com resolução, não só
    // com o preset. min(iw/ih, MAX) não faz nada pra fontes já <=1080p.
    // Sempre força dimensões pares (H.264/yuv420p exige).
    vfFilters = [
      `fps=${OUTPUT_FPS}`,
      `scale='min(${MAX_ORIGINAL_WIDTH},iw)':'min(${MAX_ORIGINAL_HEIGHT},ih)':force_original_aspect_ratio=decrease:flags=lanczos`,
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      'format=yuv420p',
    ]
  } else {
    const { width, height } = FORMAT_DIMENSIONS[format]
    if (fitMode === 'COVER') {
      // Fills the frame exactly, cropping any excess — no bars, may crop content.
      vfFilters = [
        `fps=${OUTPUT_FPS}`,
        `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos`,
        `crop=${width}:${height}`,
        'format=yuv420p',
      ]
    } else if (fitMode === 'CONTAIN') {
      // Fits the whole frame inside the canvas with black bars — never
      // crops, never zooms past 100%.
      vfFilters = [
        `fps=${OUTPUT_FPS}`,
        `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
        'format=yuv420p',
      ]
    } else {
      // BLUR_BACKGROUND: a blurred cover-cropped copy behind a contained
      // (never-cropped) copy on top — nothing from the original frame is
      // lost, no hard black bars.
      complexFilters = [
        { filter: 'fps', options: `fps=${OUTPUT_FPS}`, inputs: '0:v', outputs: 'v30' },
        { filter: 'scale', options: `${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos`, inputs: 'v30', outputs: 'bgScaled' },
        { filter: 'crop', options: `${width}:${height}`, inputs: 'bgScaled', outputs: 'bgCropped' },
        { filter: 'boxblur', options: '20:1', inputs: 'bgCropped', outputs: 'bg' },
        { filter: 'scale', options: `${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`, inputs: 'v30', outputs: 'fg' },
        { filter: 'overlay', options: '(W-w)/2:(H-h)/2', inputs: ['bg', 'fg'], outputs: 'blended' },
        { filter: 'format', options: 'yuv420p', inputs: 'blended', outputs: 'outv' },
      ]
      finalVideoLabel = 'outv'
    }
  }

  // Dimensão real do frame de saída — para ORIGINAL depende do vídeo fonte,
  // então só busca via ffprobe se algo realmente precisar (captioned ou
  // overlays/legendas do editor), e cacheia pra não repetir a chamada.
  let cachedFrameSize: { width: number; height: number } | null = null
  async function getFrameSize(): Promise<{ width: number; height: number }> {
    if (cachedFrameSize) return cachedFrameSize
    if (isOriginal) {
      const meta = await getVideoMetadata(inputPath)
      const srcW = meta.width || 1280
      const srcH = meta.height || 720
      // Mesmo teto aplicado no filtro de scale acima — overlays/legendas
      // precisam calcular posição contra o frame FINAL, não a fonte original.
      const scale = Math.min(1, MAX_ORIGINAL_WIDTH / srcW, MAX_ORIGINAL_HEIGHT / srcH)
      cachedFrameSize = {
        width: Math.max(2, Math.round((srcW * scale) / 2) * 2),
        height: Math.max(2, Math.round((srcH * scale) / 2) * 2),
      }
    } else {
      cachedFrameSize = FORMAT_DIMENSIONS[format]
    }
    return cachedFrameSize
  }

  if (hasSplitLayout) {
    const { width: canvasW, height: canvasH } = await getFrameSize()
    const srcMeta = await getVideoMetadata(inputPath)
    complexFilters = buildSplitLayoutFilters(
      opts.layoutMode!,
      opts.layoutConfig!,
      canvasW,
      canvasH,
      srcMeta.width || canvasW,
      srcMeta.height || canvasH
    )
    vfFilters = []
    finalVideoLabel = 'outv'
  } else if (hasTransform || hasCrop) {
    const { width: canvasW, height: canvasH } = await getFrameSize()
    let cropFilter: string[] = []
    if (hasCrop) {
      const srcMeta = await getVideoMetadata(inputPath)
      cropFilter = buildLayerCropFilter(cropSrc!, srcMeta.width || canvasW, srcMeta.height || canvasH)
    }
    vfFilters = [...cropFilter, ...buildTransformFilter(effective!, canvasW, canvasH)]
  }

  // 'clean' is the default: no drawtext, no burned-in title/caption, no box.
  // Captions/titles stay as data in the DB for manual use in CapCut.
  if (exportMode === 'captioned') {
    const frameWidth = (await getFrameSize()).width

    const fontPath = resolveFontPath()
    const fontFileClause = fontPath ? `:fontfile='${escapeFontPathForFilter(fontPath)}'` : ''
    if (!fontPath) {
      console.warn('[ffmpeg] Nenhuma fonte encontrada para drawtext — renderizando sem texto sobreposto. Defina FFMPEG_FONT_PATH para habilitar.')
    }

    const captionOptions = caption && fontPath
      ? `text='${wrapTextForWidth(caption, frameWidth, 52)}'${fontFileClause}:fontsize=52:fontcolor=white:x=(w-text_w)/2:y=h-text_h-60:shadowcolor=black:shadowx=2:shadowy=2:line_spacing=10:box=1:boxcolor=black@0.4:boxborderw=10`
      : null
    const titleOptions = title && fontPath
      ? `text='${wrapTextForWidth(title, frameWidth, 40)}'${fontFileClause}:fontsize=40:fontcolor=white:x=(w-text_w)/2:y=40:shadowcolor=black:shadowx=2:shadowy=2`
      : null

    if (complexFilters) {
      let last = finalVideoLabel
      if (captionOptions) {
        complexFilters.push({ filter: 'drawtext', options: captionOptions, inputs: last, outputs: 'capped' })
        last = 'capped'
      }
      if (titleOptions) {
        complexFilters.push({ filter: 'drawtext', options: titleOptions, inputs: last, outputs: 'titled' })
        last = 'titled'
      }
      finalVideoLabel = last
    } else {
      if (captionOptions) vfFilters.push(`drawtext=${captionOptions}`)
      if (titleOptions) vfFilters.push(`drawtext=${titleOptions}`)
    }
  }

  // Estado do editor: overlays de texto, legendas automáticas (estilo
  // "palavra em destaque", uma por vez — mais robusto no drawtext do FFmpeg
  // do que tentar destacar uma palavra dentro de uma frase inteira já
  // desenhada) e efeitos simples de cor/zoom. Aplica-se sempre que o
  // clipe foi editado, independente de exportMode.
  if ((editorOverlays && editorOverlays.length) || (editorCaptions && editorCaptions.length) || (editorEffects && editorEffects.length)) {
    const { width: frameW, height: frameH } = await getFrameSize()
    const scale = frameW / 1080 // overlays/legendas são definidos pensando num frame de referência de 1080px
    // O texto inteiro vai entre aspas simples (text='...') no filtro do
    // ffmpeg. Uma aspa simples literal dentro de um trecho já entre aspas
    // simples não pode ser escapada com "\'" (não funciona — quebra o
    // parser do filtro, visto na prática com "Missing ')' ... in 'between(t'"
    // ao legendar uma palavra com apóstrofo tipo "Let's"). O jeito correto é
    // fechar a aspa, inserir a aspa literal escapada fora dela, e reabrir:
    // 'Let' + \' + 's' vira Let'\''s.
    const escapeDrawtext = (text: string) => text.replace(/'/g, "'\\''").replace(/:/g, '\\:')
    // Cada overlay/estilo de legenda pode ter sua própria fonte (seletor no
    // editor) — resolve por item em vez de uma fonte única global.
    const fontFileClauseFor = (fontFamily?: FontFamilyId) => {
      const fontPath = resolveFontPath(fontFamily)
      return fontPath ? `:fontfile='${escapeFontPathForFilter(fontPath)}'` : ''
    }

    const editorFilters: string[] = []

    for (const overlay of editorOverlays || []) {
      const x = Math.round(overlay.x * frameW)
      const y = Math.round(overlay.y * frameH)
      const fontSize = Math.max(8, Math.round(overlay.fontSize * scale))
      editorFilters.push(
        `drawtext=text='${escapeDrawtext(overlay.text)}'${fontFileClauseFor(overlay.fontFamily)}` +
        `:fontsize=${fontSize}:fontcolor=${overlay.color}` +
        `:bordercolor=${overlay.strokeColor}:borderw=2` +
        `:x=${x}:y=${y}` +
        `:enable='between(t,${overlay.startTime},${overlay.endTime})'`
      )
    }

    // Legendas: uma palavra grande por vez, centralizada — aproximação do
    // efeito "karaokê" viral do CapCut. Destacar palavra a palavra dentro
    // de uma frase já desenhada exigiria posicionamento por caractere, que
    // o drawtext do FFmpeg não calcula de forma confiável.
    const style = editorCaptionStyle
    if (style && editorCaptions) {
      const fontSize = Math.max(8, Math.round(style.fontSize * scale))
      const captionFontFileClause = fontFileClauseFor(style.fontFamily)
      const yExpr =
        style.position === 'top' ? `${Math.round(frameH * 0.08)}`
        : style.position === 'center' ? '(h-text_h)/2'
        : `h-text_h-${Math.round(frameH * 0.12)}`

      for (const segment of editorCaptions) {
        for (const word of segment.words) {
          editorFilters.push(
            `drawtext=text='${escapeDrawtext(word.word)}'${captionFontFileClause}` +
            `:fontsize=${fontSize}:fontcolor=${style.highlightColor}` +
            `:bordercolor=${style.strokeColor}:borderw=3` +
            `:x=(w-text_w)/2:y=${yExpr}` +
            `:enable='between(t,${word.start},${word.end})'`
          )
        }
      }
    }

    for (const effect of editorEffects || []) {
      const dur = Math.max(0.01, effect.endTime - effect.startTime)
      if (effect.type === 'colorFilter') {
        const p = effect.params as { brightness: number; contrast: number; saturation: number }
        editorFilters.push(
          `eq=brightness=${p.brightness}:contrast=${p.contrast}:saturation=${p.saturation}` +
          `:enable='between(t,${effect.startTime},${effect.endTime})'`
        )
      } else if (effect.type === 'zoomPan') {
        // Ken Burns simplificado, em 2 passos porque nem todo filtro aceita
        // as mesmas opções: (1) crop não tem a opção eval, então não dá pra
        // encolher a janela do crop diretamente com uma expressão que varia
        // por frame ("Option 'eval' not found"); (2) scale não suporta
        // timeline (a opção enable — "Timeline ('enable' option) not
        // supported with filter 'scale'"), testado direto com o binário do
        // FFmpeg. Solução: cresce o frame com scale (eval=frame, sem enable —
        // a condição de tempo vai embutida na própria expressão via
        // if(between(...))), depois recorta de volta pro tamanho original
        // com crop de w/h FIXOS (só x/y variam, que o crop já avalia por
        // frame nativamente, sem precisar de eval nem enable). Fora da
        // janela de tempo o fator de zoom vira 1 (scale vira no-op) e o crop
        // seguinte é uma recorte idêntico ao tamanho de entrada — efeito
        // liga/desliga sem depender de timeline em nenhum dos dois filtros.
        const p = effect.params as { fromScale: number; toScale: number }
        const zoomExpr = `(${p.fromScale}+(${p.toScale}-${p.fromScale})*(t-${effect.startTime})/${dur})`
        const zoomFactor = `if(between(t,${effect.startTime},${effect.endTime}),${zoomExpr},1)`
        editorFilters.push(
          `scale=w='iw*${zoomFactor}':h='ih*${zoomFactor}':eval=frame`
        )
        editorFilters.push(
          `crop=${frameW}:${frameH}:x='(iw-${frameW})/2':y='(ih-${frameH})/2'`
        )
      } else if (effect.type === 'zoomPunch') {
        // "Pulo" de zoom que sobe e volta dentro da própria janela do efeito
        // (diferente do zoomPan, que é uma rampa linear do início ao fim) —
        // mesma técnica de scale+crop com janela de tempo embutida na
        // expressão (não dá pra usar `enable` no scale, testado antes).
        const p = effect.params as { intensity: number }
        const peak = Math.min(1, Math.max(0, p.intensity)) * 0.5
        const punchExpr = `(1+${peak}*sin(PI*(t-${effect.startTime})/${dur}))`
        const zoomFactor = `if(between(t,${effect.startTime},${effect.endTime}),${punchExpr},1)`
        editorFilters.push(`scale=w='iw*${zoomFactor}':h='ih*${zoomFactor}':eval=frame`)
        editorFilters.push(`crop=${frameW}:${frameH}:x='(iw-${frameW})/2':y='(ih-${frameH})/2'`)
      } else if (effect.type === 'shake') {
        // Tremor de câmera: aumenta o frame um pouco (só durante a janela do
        // efeito, embutido na expressão) pra abrir espaço, depois recorta
        // com x/y oscilando em senoides de frequências diferentes (evita um
        // padrão óbvio de vai-e-volta reto).
        const p = effect.params as { intensity: number }
        const amp = Math.round(Math.min(1, Math.max(0, p.intensity)) * 18)
        const marginScale = 1 + Math.min(1, Math.max(0, p.intensity)) * 0.12
        const zoomFactor = `if(between(t,${effect.startTime},${effect.endTime}),${marginScale},1)`
        editorFilters.push(`scale=w='iw*${zoomFactor}':h='ih*${zoomFactor}':eval=frame`)
        const gate = `between(t,${effect.startTime},${effect.endTime})`
        editorFilters.push(
          `crop=${frameW}:${frameH}:` +
          `x='(iw-${frameW})/2+if(${gate},${amp}*sin(2*PI*9*t),0)':` +
          `y='(ih-${frameH})/2+if(${gate},${amp}*cos(2*PI*13*t),0)'`
        )
      } else if (effect.type === 'blur') {
        const p = effect.params as { intensity: number }
        const radius = Math.round(Math.min(1, Math.max(0, p.intensity)) * 15)
        editorFilters.push(`boxblur=luma_radius=${radius}:luma_power=1:enable='between(t,${effect.startTime},${effect.endTime})'`)
      } else if (effect.type === 'flash') {
        const p = effect.params as { intensity: number }
        const brightness = Math.min(1, Math.max(0, p.intensity))
        editorFilters.push(`eq=brightness=${brightness.toFixed(2)}:enable='between(t,${effect.startTime},${effect.endTime})'`)
      } else if (effect.type === 'vignette') {
        const p = effect.params as { intensity: number }
        // Ângulo menor = vinheta mais fechada/forte; maior = mais suave.
        const angleDiv = 5 - Math.min(1, Math.max(0, p.intensity)) * 3
        editorFilters.push(`vignette=angle=PI/${angleDiv.toFixed(2)}:enable='between(t,${effect.startTime},${effect.endTime})'`)
      } else if (effect.type === 'sharpen') {
        const p = effect.params as { intensity: number }
        const amount = (Math.min(1, Math.max(0, p.intensity)) * 2.5).toFixed(2)
        editorFilters.push(`unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=${amount}:enable='between(t,${effect.startTime},${effect.endTime})'`)
      } else if (effect.type === 'grain') {
        const p = effect.params as { intensity: number }
        const strength = Math.round(Math.min(1, Math.max(0, p.intensity)) * 40)
        editorFilters.push(`noise=alls=${strength}:allf=t:enable='between(t,${effect.startTime},${effect.endTime})'`)
      } else if (effect.type === 'rgbSplit') {
        const p = effect.params as { intensity: number }
        const shift = Math.round(Math.min(1, Math.max(0, p.intensity)) * 12)
        editorFilters.push(`rgbashift=rh=${shift}:bh=-${shift}:enable='between(t,${effect.startTime},${effect.endTime})'`)
      }
    }

    if (editorFilters.length) {
      if (complexFilters) {
        let last = finalVideoLabel
        editorFilters.forEach((filterStr, i) => {
          // Só o primeiro '=' separa o nome do filtro das opções — as opções
          // em si têm vários '=' (fontsize=52:fontcolor=...), então
          // split('=') ingênuo cortaria no lugar errado.
          const eqIdx = filterStr.indexOf('=')
          const filterName = filterStr.slice(0, eqIdx)
          const filterOptions = filterStr.slice(eqIdx + 1)
          const outputLabel = `edit${i}`
          complexFilters!.push({ filter: filterName, options: filterOptions, inputs: last, outputs: outputLabel })
          last = outputLabel
        })
        finalVideoLabel = last
      } else {
        vfFilters.push(...editorFilters)
      }
    }
  }

  // New (non-ORIGINAL) formats favor render speed (multiple formats may be
  // generated per clip) — ORIGINAL keeps its already-tuned settings
  // untouched. Env vars only override the non-ORIGINAL defaults.
  //
  // ORIGINAL nunca decodifica+codifica acima de MAX_ORIGINAL_WIDTH x
  // MAX_ORIGINAL_HEIGHT (ver scale acima) — por isso 'medium' aqui não é
  // mais o risco de OOM que já foi com fontes 4K puras.
  const preset = isOriginal ? 'medium' : (process.env.FFMPEG_PRESET || 'veryfast')
  const crf = isOriginal ? '20' : String(process.env.FFMPEG_CRF || '22')
  const audioBitrate = isOriginal ? '192k' : '160k'
  const threads = String(Math.max(1, Number(process.env.FFMPEG_THREADS) || 2))

  return new Promise((resolve, reject) => {
    const stderrLines: string[] = []
    let settled = false

    const cmd = ffmpeg(inputPath)
      .inputOptions(['-fflags', '+genpts'])
      .seekInput(startTime)
      .duration(duration)

    if (complexFilters) {
      cmd.complexFilter(complexFilters, finalVideoLabel)
      cmd.outputOptions(['-map', '0:a?'])
    } else {
      cmd.videoFilter(vfFilters.join(','))
    }

    cmd
      .audioFilter('aresample=async=1000:first_pts=0')
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate(audioBitrate)
      .outputOptions([
        '-preset', preset,
        '-crf', crf,
        '-pix_fmt', 'yuv420p',
        '-r', String(OUTPUT_FPS),
        '-fps_mode', 'cfr',
        '-g', String(GOP),
        '-keyint_min', String(GOP),
        '-sc_threshold', '0',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        '-threads', threads,
        '-sn', '-dn',
      ])
      .output(outputPath)

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }

    cmd.on('start', (commandLine) => {
      console.log(`[ffmpeg] render de corte — comando: ${commandLine}`)
      console.log(`[ffmpeg] input: ${inputPath}`)
      console.log(`[ffmpeg] output: ${outputPath}`)
    })

    cmd.on('stderr', (line) => {
      stderrLines.push(line)
    })

    if (onProgress) {
      cmd.on('progress', (p) => onProgress(Math.round(p.percent ?? 0)))
    }

    // Só considera concluído (e só então o worker marca RENDERED no banco)
    // depois de confirmar que o FFmpeg terminou com exit code 0 E que o
    // arquivo de saída existe com tamanho > 0 — evita liberar preview/download
    // de um arquivo parcialmente escrito.
    cmd.on('end', () => {
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        finish(new Error(`Renderização gerou arquivo vazio ou ausente: ${outputPath}`))
        return
      }
      console.log(`[ffmpeg] corte renderizado com sucesso: ${outputPath} (${fs.statSync(outputPath).size} bytes)`)
      finish()
    })

    cmd.on('error', (err) => {
      const detail = stderrLines.slice(-20).join('\n')
      finish(new Error(`Falha ao renderizar corte: ${err.message}${detail ? `\n${detail}` : ''}`))
    })

    cmd.run()
  })
}

export function splitVideoIntoChunks(
  videoPath: string,
  outputDir: string,
  chunkDurationSecs: number = 900,
  // Chunks whose transcription already succeeded on a previous attempt (long
  // lives resuming after a crash/retry) — re-splitting them is pure wasted
  // I/O over a possibly huge source file, so skip straight past if the
  // output already exists on disk.
  skipIndexes: Set<number> = new Set()
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, data) => {
      if (err) return reject(err)

      const totalDuration = Number(data.format.duration ?? 0)
      const numChunks = Math.ceil(totalDuration / chunkDurationSecs)
      const ext = path.extname(videoPath)
      const chunkPaths: string[] = []

      const processChunk = (i: number) => {
        if (i >= numChunks) return resolve(chunkPaths)

        const start = i * chunkDurationSecs
        const chunkPath = path.join(outputDir, `chunk_${i}${ext}`)
        chunkPaths.push(chunkPath)

        if (skipIndexes.has(i) && fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) {
          processChunk(i + 1)
          return
        }

        ffmpeg(videoPath)
          .seekInput(start)
          .duration(chunkDurationSecs)
          .videoCodec('copy')
          .audioCodec('copy')
          .output(chunkPath)
          .on('end', () => processChunk(i + 1))
          .on('error', reject)
          .run()
      }

      processChunk(0)
    })
  })
}
