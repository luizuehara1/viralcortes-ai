import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'
import type { TextOverlay, CaptionSegment, CaptionStyle, Effect } from '@/types'

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH)

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps: number
  bitrate: number
}

export function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err)
      const video = data.streams.find((s) => s.codec_type === 'video')
      const duration = data.format.duration ?? 0
      resolve({
        duration: Number(duration),
        width: video?.width ?? 0,
        height: video?.height ?? 0,
        fps: eval(video?.r_frame_rate ?? '30') || 30,
        bitrate: Number(data.format.bit_rate ?? 0),
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
  onProgress?: (progress: number) => void
}

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  VERTICAL_9_16:  { width: 1080, height: 1920 },
  SQUARE_1_1:     { width: 1080, height: 1080 },
  HORIZONTAL_16_9:{ width: 1920, height: 1080 },
  FEED_4_5:       { width: 1080, height: 1350 },
}

// drawtext resolves fonts through Fontconfig by default, which isn't
// configured on plain Windows ffmpeg builds ("Cannot load default config
// file"). Pointing fontfile= at a real font file bypasses Fontconfig entirely.
let cachedFontPath: string | null | undefined
function resolveFontPath(): string | null {
  if (cachedFontPath !== undefined) return cachedFontPath
  const candidates = [
    process.env.FFMPEG_FONT_PATH,
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ].filter(Boolean) as string[]
  cachedFontPath = candidates.find((p) => fs.existsSync(p)) ?? null
  return cachedFontPath
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

  if (!fs.existsSync(inputPath)) {
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

  if (isOriginal) {
    // Keeps the source aspect ratio untouched — no crop, no scale to a fixed
    // canvas, no zoom. Only forces even width/height because H.264
    // (yuv420p) requires both dimensions to be divisible by 2.
    vfFilters = [`fps=${OUTPUT_FPS}`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p']
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
      cachedFrameSize = { width: meta.width || 1280, height: meta.height || 720 }
    } else {
      cachedFrameSize = FORMAT_DIMENSIONS[format]
    }
    return cachedFrameSize
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
    const fontPath = resolveFontPath()
    if (!fontPath) {
      console.warn('[ffmpeg] Nenhuma fonte encontrada — overlays/legendas do editor não serão queimados. Defina FFMPEG_FONT_PATH.')
    }
    const fontFileClause = fontPath ? `:fontfile='${escapeFontPathForFilter(fontPath)}'` : ''
    const escapeDrawtext = (text: string) => text.replace(/'/g, "\\'").replace(/:/g, '\\:')

    const editorFilters: string[] = []

    if (fontPath) {
      for (const overlay of editorOverlays || []) {
        const x = Math.round(overlay.x * frameW)
        const y = Math.round(overlay.y * frameH)
        const fontSize = Math.max(8, Math.round(overlay.fontSize * scale))
        editorFilters.push(
          `drawtext=text='${escapeDrawtext(overlay.text)}'${fontFileClause}` +
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
        const yExpr =
          style.position === 'top' ? `${Math.round(frameH * 0.08)}`
          : style.position === 'center' ? '(h-text_h)/2'
          : `h-text_h-${Math.round(frameH * 0.12)}`

        for (const segment of editorCaptions) {
          for (const word of segment.words) {
            editorFilters.push(
              `drawtext=text='${escapeDrawtext(word.word)}'${fontFileClause}` +
              `:fontsize=${fontSize}:fontcolor=${style.highlightColor}` +
              `:bordercolor=${style.strokeColor}:borderw=3` +
              `:x=(w-text_w)/2:y=${yExpr}` +
              `:enable='between(t,${word.start},${word.end})'`
            )
          }
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
        // Ken Burns simplificado: encolhe a janela de crop ao longo do tempo
        // (zoom-in) usando expressões avaliadas por frame. Aplicado por cima
        // do frame já composto — em CONTAIN pode "zoomar" nas barras pretas,
        // efeito colateral aceitável para uma primeira versão.
        const p = effect.params as { fromScale: number; toScale: number }
        const zoomExpr = `(${p.fromScale}+(${p.toScale}-${p.fromScale})*(t-${effect.startTime})/${dur})`
        editorFilters.push(
          `crop=w='iw/${zoomExpr}':h='ih/${zoomExpr}':x='(iw-iw/${zoomExpr})/2':y='(ih-ih/${zoomExpr})/2'` +
          `:eval=frame:enable='between(t,${effect.startTime},${effect.endTime})'`
        )
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
