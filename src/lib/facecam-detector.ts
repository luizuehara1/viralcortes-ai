import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { generateThumbnail, getVideoMetadata } from './ffmpeg'

// Lazy singleton: construir no import-time faz `next build` estourar
// "Collecting page data" quando ANTHROPIC_API_KEY não está setada no
// ambiente de build (ex.: build de Docker sem secrets injetados) — o SDK
// valida a apiKey no construtor, então só instanciamos no primeiro uso real.
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 })
  return _anthropic
}

export interface FacecamDetection {
  detected: boolean
  confidence: number
  /** Pixel-space bounding box in the ORIGINAL video's resolution — ready to feed straight into cropVideoRegion. */
  region?: { x: number; y: number; width: number; height: number }
  /** Source video's pixel dimensions, so callers can render/clamp a region overlay without re-probing the file. */
  videoWidth: number
  videoHeight: number
}

const MIN_CONFIDENCE = 0.6

const PROMPT = `Esta é uma captura de tela de um vídeo/live. Verifique se existe uma "facecam" (uma janela pequena sobreposta, geralmente em um canto, mostrando o rosto/webcam de uma pessoa) por cima do conteúdo principal (gameplay, tela, cena).

Responda APENAS com um objeto JSON, sem texto antes ou depois, no formato:
{"detected": true ou false, "confidence": número de 0 a 1, "x": fração 0-1 da borda esquerda, "y": fração 0-1 da borda superior, "width": fração 0-1 da largura, "height": fração 0-1 da altura}

Se não houver facecam visível, responda {"detected": false, "confidence": 0}.
As frações x/y/width/height são relativas ao tamanho total da imagem (0 = borda esquerda/topo, 1 = borda direita/base).`

function extractJSON(text: string): string {
  const withoutFences = text.replace(/```(?:json)?/gi, '')
  const match = withoutFences.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude não retornou JSON válido para detecção de facecam')
  return match[0]
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Best-effort automatic facecam detection using Claude vision on a single
 * representative frame. Never throws for a "not found" case — returns
 * detected:false so callers fall back to manual configuration. Hard failures
 * (API/network error, bad response) are swallowed the same way, since a
 * failed auto-detect should degrade to manual, not break the flow.
 */
export async function detectFacecamRegion(videoPath: string): Promise<FacecamDetection> {
  const metadata = await getVideoMetadata(videoPath)
  const tmpFrame = path.join(path.dirname(videoPath), `.facecam-frame-${Date.now()}.jpg`)

  try {
    await generateThumbnail(videoPath, tmpFrame, Math.min(5, metadata.duration / 4))
    const imageBase64 = fs.readFileSync(tmpFrame).toString('base64')

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Resposta inválida da IA')

    const parsed = JSON.parse(extractJSON(content.text)) as {
      detected: boolean
      confidence: number
      x?: number
      y?: number
      width?: number
      height?: number
    }

    const dims = { videoWidth: metadata.width, videoHeight: metadata.height }

    if (!parsed.detected || parsed.confidence < MIN_CONFIDENCE) {
      return { detected: false, confidence: parsed.confidence ?? 0, ...dims }
    }
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return { detected: false, confidence: parsed.confidence, ...dims }
    }

    const x = Math.round(clamp01(parsed.x) * metadata.width)
    const y = Math.round(clamp01(parsed.y) * metadata.height)
    const width = Math.round(clamp01(parsed.width) * metadata.width)
    const height = Math.round(clamp01(parsed.height) * metadata.height)

    if (width < 16 || height < 16) {
      return { detected: false, confidence: parsed.confidence, ...dims }
    }

    return {
      detected: true,
      confidence: parsed.confidence,
      ...dims,
      region: {
        x: Math.min(x, metadata.width - width),
        y: Math.min(y, metadata.height - height),
        width,
        height,
      },
    }
  } catch (err) {
    console.warn('[facecam-detector] Falha na detecção automática — caindo para configuração manual:', err)
    return { detected: false, confidence: 0, videoWidth: metadata.width, videoHeight: metadata.height }
  } finally {
    fs.rm(tmpFrame, { force: true }, () => {})
  }
}
