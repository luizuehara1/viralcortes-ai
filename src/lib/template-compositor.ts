import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'

export interface BlueRegion {
  x: number
  y: number
  width: number
  height: number
  pixelCount: number
  fillRatio: number
}

interface RawTemplate {
  width: number
  height: number
  channels: number
  data: Buffer
}

const MIN_REGION_PIXELS = 400
const MIN_FILL_RATIO = 0.55

function isPureBlue(r: number, g: number, b: number): boolean {
  return r < 20 && g < 20 && b > 180
}

async function loadRaw(imagePath: string): Promise<RawTemplate> {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, channels: info.channels, data }
}

/**
 * Detects solid-blue rectangular regions in a template image via flood fill
 * over a "pure blue" pixel mask, so the same code keeps working if the
 * template is swapped out for a different one later.
 */
export async function detectBlueRegions(imagePath: string): Promise<{ regions: BlueRegion[]; masks: Uint8Array[]; width: number; height: number }> {
  const { width, height, channels, data } = await loadRaw(imagePath)

  const isBlueMask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      if (isPureBlue(data[idx], data[idx + 1], data[idx + 2])) {
        isBlueMask[y * width + x] = 1
      }
    }
  }

  const visited = new Uint8Array(width * height)
  const regions: BlueRegion[] = []
  const masks: Uint8Array[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!isBlueMask[start] || visited[start]) continue

      const regionMask = new Uint8Array(width * height)
      const stack = [start]
      visited[start] = 1
      let minX = x, maxX = x, minY = y, maxY = y, count = 0

      while (stack.length) {
        const cur = stack.pop() as number
        const cx = cur % width
        const cy = Math.floor(cur / width)
        regionMask[cur] = 1
        count++
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx)
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)

        const neighbors = [cur - 1, cur + 1, cur - width, cur + width]
        for (const n of neighbors) {
          if (n < 0 || n >= width * height) continue
          if (Math.abs((n % width) - cx) > 1) continue // avoid row wrap
          if (isBlueMask[n] && !visited[n]) {
            visited[n] = 1
            stack.push(n)
          }
        }
      }

      if (count < MIN_REGION_PIXELS) continue
      const w = maxX - minX + 1
      const h = maxY - minY + 1
      const fillRatio = count / (w * h)
      if (fillRatio < MIN_FILL_RATIO) continue // discard non-rectangular blobs (decorations, noise)

      regions.push({ x: minX, y: minY, width: w, height: h, pixelCount: count, fillRatio: Number(fillRatio.toFixed(3)) })
      masks.push(regionMask)
    }
  }

  // largest first — usually the "main" slot the user cares about
  const order = regions.map((_, i) => i).sort((a, b) => regions[b].pixelCount - regions[a].pixelCount)
  return {
    regions: order.map((i) => regions[i]),
    masks: order.map((i) => masks[i]),
    width,
    height,
  }
}

/**
 * Builds a version of the template with alpha=0 exactly on the pixels
 * belonging to the given regions, so compositing media underneath reveals
 * it only through the true (possibly non-rectangular) blue shape.
 */
async function buildTemplateWithHoles(imagePath: string, width: number, height: number, masksToPunch: Uint8Array[]): Promise<Buffer> {
  const raw = await sharp(imagePath).ensureAlpha().raw().toBuffer()
  const out = Buffer.from(raw) // 4 channels (RGBA) because of ensureAlpha()
  const combined = new Uint8Array(width * height)
  for (const mask of masksToPunch) {
    for (let i = 0; i < mask.length; i++) if (mask[i]) combined[i] = 1
  }
  for (let i = 0; i < width * height; i++) {
    if (combined[i]) out[i * 4 + 3] = 0
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

export interface InsertOptions {
  /** Which detected region(s) to fill. Omit to auto-pick the largest. 'all' fills every detected region with the same media. */
  regionIndex?: number | 'all'
  /** Trim the output video to this many seconds (video only). */
  trimSeconds?: number
  /** Output format for image results. Defaults to png. */
  imageFormat?: 'png' | 'jpg'
}

export interface InsertResult {
  outputPath: string
  region: BlueRegion | BlueRegion[]
  mediaType: 'image' | 'video'
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv'])

export function detectMediaType(mediaPath: string): 'image' | 'video' {
  return VIDEO_EXT.has(path.extname(mediaPath).toLowerCase()) ? 'video' : 'image'
}

/**
 * Inserts a photo or video into the blue rectangle(s) of a template,
 * preserving every other pixel of the template exactly.
 */
export async function insertMediaIntoBlueRectangle(
  templatePath: string,
  mediaPath: string,
  outputPath: string,
  options: InsertOptions = {}
): Promise<InsertResult> {
  const { regions, masks, width, height } = await detectBlueRegions(templatePath)
  if (regions.length === 0) {
    throw new Error('Nenhuma área azul foi encontrada no template')
  }

  const fillAll = options.regionIndex === 'all'
  const chosenIndexes = fillAll
    ? regions.map((_, i) => i)
    : [typeof options.regionIndex === 'number' ? options.regionIndex : 0]

  for (const i of chosenIndexes) {
    if (!regions[i]) throw new Error(`Região de índice ${i} não existe (encontradas: ${regions.length})`)
  }

  const regionMedia = new Map(chosenIndexes.map((i) => [i, mediaPath]))
  const mediaType = detectMediaType(mediaPath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  if (mediaType === 'image') {
    await insertImage(templatePath, regionMedia, outputPath, width, height, regions, masks, options)
  } else {
    await insertVideo(templatePath, regionMedia, outputPath, width, height, regions, masks, options)
  }

  return {
    outputPath,
    region: fillAll ? chosenIndexes.map((i) => regions[i]) : regions[chosenIndexes[0]],
    mediaType,
  }
}

/**
 * Like insertMediaIntoBlueRectangle, but each detected region can get its
 * own distinct media file instead of all regions sharing one — e.g. the
 * largest blue region gets the main video and the smallest gets a facecam
 * crop. All entries must be the same media type (all images or all videos).
 */
export async function insertMultipleMediaIntoRegions(
  templatePath: string,
  regionMedia: Map<number, string>,
  outputPath: string,
  options: InsertOptions = {}
): Promise<InsertResult> {
  const { regions, masks, width, height } = await detectBlueRegions(templatePath)
  if (regions.length === 0) {
    throw new Error('Nenhuma área azul foi encontrada no template')
  }

  const chosenIndexes = Array.from(regionMedia.keys())
  if (chosenIndexes.length === 0) throw new Error('Nenhuma mídia foi associada a uma região')
  for (const i of chosenIndexes) {
    if (!regions[i]) throw new Error(`Região de índice ${i} não existe (encontradas: ${regions.length})`)
  }

  const mediaTypes = new Set(Array.from(regionMedia.values()).map(detectMediaType))
  if (mediaTypes.size > 1) {
    throw new Error('Todas as mídias precisam ser do mesmo tipo (todas imagem ou todas vídeo)')
  }
  const mediaType = mediaTypes.values().next().value as 'image' | 'video'

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  if (mediaType === 'image') {
    await insertImage(templatePath, regionMedia, outputPath, width, height, regions, masks, options)
  } else {
    await insertVideo(templatePath, regionMedia, outputPath, width, height, regions, masks, options)
  }

  return {
    outputPath,
    region: chosenIndexes.length > 1 ? chosenIndexes.map((i) => regions[i]) : regions[chosenIndexes[0]],
    mediaType,
  }
}

async function insertImage(
  templatePath: string,
  regionMedia: Map<number, string>,
  outputPath: string,
  width: number,
  height: number,
  regions: BlueRegion[],
  masks: Uint8Array[],
  options: InsertOptions
) {
  const chosenIndexes = Array.from(regionMedia.keys())
  const holeTemplate = await buildTemplateWithHoles(templatePath, width, height, chosenIndexes.map((i) => masks[i]))

  const overlays: sharp.OverlayOptions[] = []
  for (const i of chosenIndexes) {
    const region = regions[i]
    const cropped = await sharp(regionMedia.get(i)!)
      .resize(region.width, region.height, { fit: 'cover', position: 'centre' })
      .toBuffer()
    overlays.push({ input: cropped, left: region.x, top: region.y })
  }
  overlays.push({ input: holeTemplate, left: 0, top: 0 })

  let pipeline = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(overlays)

  pipeline = options.imageFormat === 'jpg' ? pipeline.flatten({ background: '#000000' }).jpeg({ quality: 95 }) : pipeline.png()
  await pipeline.toFile(outputPath)
}

function ffprobeMeta(filePath: string): Promise<{ duration: number; hasAudio: boolean }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err)
      const hasAudio = data.streams.some((s) => s.codec_type === 'audio')
      resolve({ duration: Number(data.format.duration ?? 0), hasAudio })
    })
  })
}

async function insertVideo(
  templatePath: string,
  regionMedia: Map<number, string>,
  outputPath: string,
  width: number,
  height: number,
  regions: BlueRegion[],
  masks: Uint8Array[],
  options: InsertOptions
) {
  const chosenIndexes = Array.from(regionMedia.keys())
  const holeTemplateBuffer = await buildTemplateWithHoles(templatePath, width, height, chosenIndexes.map((i) => masks[i]))
  const holeTemplatePath = outputPath.replace(/\.[^.]+$/, '') + '.hole.png'
  fs.writeFileSync(holeTemplatePath, holeTemplateBuffer)

  // Audio always comes from the first region's media — when multiple regions
  // share the same underlying source (main video + a facecam crop of that
  // same video) this avoids doubled/mismatched audio.
  const primaryMediaPath = regionMedia.get(chosenIndexes[0])!
  const { duration, hasAudio } = await ffprobeMeta(primaryMediaPath)
  const targetDuration = options.trimSeconds ? Math.min(options.trimSeconds, duration) : duration

  const OUTPUT_FPS = 30
  const templateInputIndex = chosenIndexes.length // template is added right after all region inputs

  const stderrLines: string[] = []

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
    chosenIndexes.forEach((i) => command.input(regionMedia.get(i)!))
    command.input(holeTemplatePath).inputOptions(['-loop 1', `-framerate ${OUTPUT_FPS}`])

    const filters: ffmpeg.FilterSpecification[] = []
    filters.push({
      filter: 'color',
      options: { color: 'black', size: `${width}x${height}`, rate: OUTPUT_FPS },
      outputs: 'canvas',
    })

    let lastMerge = 'canvas'
    chosenIndexes.forEach((regionIdx, n) => {
      const region = regions[regionIdx]
      // Muitos vídeos fonte não começam a linha do tempo exatamente em PTS=0
      // (edição prévia, contêiner com offset, etc.) — sem isso, o overlay
      // mostra só o canvas preto até o primeiro frame "de verdade" do vídeo
      // chegar, dando a impressão de que o vídeo carrega/sincroniza atrasado
      // em vez de aparecer junto com o template desde o primeiro frame.
      const resetLabel = `reset${n}`
      filters.push({
        filter: 'setpts',
        options: 'PTS-STARTPTS',
        inputs: `${n}:v`,
        outputs: resetLabel,
      })
      // Normalize each source to a constant 30fps before any scaling/overlay
      // so VFR input (common cause of stutter/frame-pacing issues) can't
      // leak through the filter graph.
      const normLabel = `v30_${n}`
      filters.push({
        filter: 'fps',
        options: `fps=${OUTPUT_FPS}`,
        inputs: resetLabel,
        outputs: normLabel,
      })
      const scaledLabel = `scaled${n}`
      filters.push({
        filter: 'scale',
        options: `${region.width}:${region.height}:force_original_aspect_ratio=increase:flags=lanczos`,
        inputs: normLabel,
        outputs: scaledLabel,
      })
      const croppedLabel = `cropped${n}`
      filters.push({
        filter: 'crop',
        options: `${region.width}:${region.height}`,
        inputs: scaledLabel,
        outputs: croppedLabel,
      })
      const mergedLabel = `merged${n}`
      filters.push({
        filter: 'overlay',
        options: { x: region.x, y: region.y },
        inputs: [lastMerge, croppedLabel],
        outputs: mergedLabel,
      })
      lastMerge = mergedLabel
    })

    filters.push({
      filter: 'overlay',
      options: { x: 0, y: 0 },
      inputs: [lastMerge, `${templateInputIndex}:v`],
      outputs: 'merged_final',
    })
    // Template images can have odd pixel dimensions (e.g. exported from a
    // design tool at 941x1672) — libx264/yuv420p requires even width and
    // height, so trim at most 1px off each edge right before encoding.
    filters.push({
      filter: 'crop',
      options: 'trunc(iw/2)*2:trunc(ih/2)*2',
      inputs: 'merged_final',
      outputs: 'outv',
    })

    command.complexFilter(filters, 'outv')
    if (hasAudio) command.outputOptions(['-map', '0:a'])
    command
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt', 'yuv420p',
        // Esse resultado costuma passar por um segundo encode depois (Editar/
        // Legendar, e a própria plataforma ao publicar) — cada passagem perde
        // qualidade de novo, então esse primeiro encode usa CRF mais baixo
        // (mais próximo de sem perdas) que o das outras renderizações. Preset
        // fica em 'medium' (não 'slow') de propósito — o container roda com
        // só 1GB de RAM e esse encode já decodifica várias entradas de vídeo
        // ao mesmo tempo (filtro complexo do template); 'slow' usa mais
        // memória/CPU por mais tempo, risco real de OOM nesse limite.
        '-preset', 'medium',
        '-crf', '17',
        '-r', String(OUTPUT_FPS),
        '-fps_mode', 'cfr',
        '-movflags', '+faststart',
      ])
    if (hasAudio) command.audioCodec('aac').audioBitrate('256k')
    command.duration(targetDuration)
    command.output(outputPath)

    command.on('stderr', (line) => stderrLines.push(line))
    command.on('error', (err) => {
      const detail = stderrLines.slice(-20).join('\n')
      reject(new Error(`Falha ao compor vídeo do template: ${err.message}${detail ? `\n${detail}` : ''}`))
    })
    command.on('end', () => {
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error(`Composição gerou arquivo vazio ou ausente: ${outputPath}`))
        return
      }
      resolve()
    })
    command.run()
  })

  fs.rmSync(holeTemplatePath, { force: true })
}
