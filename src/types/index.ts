export type VideoStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'IMPORTING'
  | 'AWAITING_LOCAL_DOWNLOAD'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'ANALYZING'
  | 'COMPLETED'
  | 'FAILED'

export type SourceType = 'UPLOAD' | 'URL'

export type SourcePlatform =
  | 'YOUTUBE'
  | 'TWITCH'
  | 'KICK'
  | 'TIKTOK'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'DIRECT_URL'
  | 'OTHER'

export const SOURCE_PLATFORM_LABELS: Record<SourcePlatform, string> = {
  YOUTUBE: 'YouTube',
  TWITCH: 'Twitch',
  KICK: 'Kick',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  DIRECT_URL: 'Link direto',
  OTHER: 'Outra plataforma',
}

export type ClipStatus = 'SUGGESTED' | 'SELECTED' | 'RENDERING' | 'RENDERED' | 'FAILED'

export type ClipEmotion =
  | 'POLEMICA'
  | 'HUMOR'
  | 'SURPRESA'
  | 'ENSINO'
  | 'HISTORIA'
  | 'OPINIAO_FORTE'
  | 'REVELACAO'
  | 'CONFLITO'
  | 'FRASE_DE_IMPACTO'

export type ClipFormat = 'ORIGINAL' | 'VERTICAL_9_16' | 'SQUARE_1_1' | 'HORIZONTAL_16_9' | 'FEED_4_5'

export type FitMode = 'CONTAIN' | 'COVER' | 'BLUR_BACKGROUND'

export const CLIP_FORMAT_LABELS: Record<ClipFormat, string> = {
  ORIGINAL: 'Manter original',
  VERTICAL_9_16: '9:16 · TikTok/Reels/Shorts',
  HORIZONTAL_16_9: '16:9 · YouTube',
  SQUARE_1_1: '1:1 · Feed',
  FEED_4_5: '4:5 · Instagram',
}

export const FIT_MODE_LABELS: Record<FitMode, string> = {
  CONTAIN: 'Conter sem cortar',
  COVER: 'Preencher cortando excesso',
  BLUR_BACKGROUND: 'Fundo desfocado',
}

export type JobType = 'EXTRACT_AUDIO' | 'TRANSCRIBE' | 'ANALYZE_CLIPS' | 'RENDER_CLIP'

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export type SocialProvider = 'YOUTUBE' | 'INSTAGRAM'

export interface SocialAccountSummary {
  id: string
  providerAccountId: string
  accountName: string | null
  accountAvatar: string | null
  scope: string | null
  expiresAt: string | null
  updatedAt: string
  metadata?: { pageId?: string; pageName?: string } | null
}

// ---------------------------------------------------------------------------
// Editor de vídeo (preview + overlays + legendas automáticas + efeitos)
//
// Tudo abaixo vive num único blob JSON em SuggestedClip.editorState — o
// worker de render (clip-renderer.ts) lê esse blob e passa pra renderClip
// (lib/ffmpeg.ts) só quando o usuário efetivamente editou o clipe. Nada aqui
// afeta o fluxo clean/captioned existente quando editorState é null.
// ---------------------------------------------------------------------------

export type TextOverlayAnimation = 'none' | 'fade' | 'pop' | 'slide'

// Cada id mapeia pra um arquivo de fonte real instalado no container (ver
// resolveFontPath em src/lib/ffmpeg.ts) — cshFamily é só a aproximação usada
// no preview do navegador (fontes do sistema do usuário, não o arquivo real
// que o FFmpeg queima no vídeo final).
export type FontFamilyId = 'dejavu-sans' | 'liberation-sans' | 'liberation-serif' | 'freemono'

export interface FontOption {
  id: FontFamilyId
  label: string
  cssFamily: string
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'dejavu-sans', label: 'DejaVu Sans (padrão)', cssFamily: 'Verdana, Arial, sans-serif' },
  { id: 'liberation-sans', label: 'Liberation Sans (estilo Arial)', cssFamily: 'Arial, Helvetica, sans-serif' },
  { id: 'liberation-serif', label: 'Liberation Serif (estilo Times)', cssFamily: 'Georgia, "Times New Roman", serif' },
  { id: 'freemono', label: 'FreeMono (monoespaçada)', cssFamily: '"Courier New", monospace' },
]

export const DEFAULT_FONT_FAMILY: FontFamilyId = 'dejavu-sans'

export interface TextOverlay {
  id: string
  text: string
  startTime: number // segundos, relativo ao início do clipe (0 = corte do clipe)
  endTime: number
  x: number // posição relativa 0-1 (0 = esquerda/topo, 1 = direita/base)
  y: number
  fontSize: number // em px, relativo a um frame de referência de 1080px de largura
  color: string
  strokeColor: string
  animation: TextOverlayAnimation
  // Opcional pra compatibilidade com overlays salvos antes dessa opção
  // existir — sempre tratar undefined como DEFAULT_FONT_FAMILY.
  fontFamily?: FontFamilyId
}

export interface CaptionWord {
  word: string
  start: number // segundos, relativo ao início do clipe
  end: number
}

export type CaptionPosition = 'top' | 'center' | 'bottom'

export interface CaptionStyle {
  fontSize: number
  color: string
  highlightColor: string // cor da palavra ativa (efeito "karaokê")
  strokeColor: string
  position: CaptionPosition
  fontFamily?: FontFamilyId
}

export interface CaptionSegment {
  id: string
  words: CaptionWord[]
  editedText?: string // se o usuário corrigir o texto reconhecido pelo Whisper
}

export type EffectType = 'colorFilter' | 'zoomPan'

// Valores no mesmo range do filtro `eq` do FFmpeg (usados direto, sem
// conversão) — brightness 0 = neutro (-1..1), contrast/saturation 1 = neutro.
export interface ColorFilterParams {
  brightness: number // -1..1, 0 = neutro
  contrast: number // 0..2, 1 = neutro
  saturation: number // 0..3, 1 = neutro
}

export interface ZoomPanParams {
  fromScale: number // ex: 1.0
  toScale: number // ex: 1.15 (efeito Ken Burns)
}

export interface Effect {
  id: string
  type: EffectType
  startTime: number
  endTime: number
  params: ColorFilterParams | ZoomPanParams
}

// Layouts "split-screen" pra cortes verticais com facecam — empilha duas
// regiões do MESMO vídeo fonte (não dois vídeos diferentes, como o Template
// Studio) uma em cima da outra. Vive no EditorState (não como novo FitMode)
// porque precisa funcionar tanto no corte normal quanto no resultado de
// template (que usa format:'ORIGINAL' e nem passa fitMode pro renderClip).
export type SplitLayoutMode = 'MAIN_TOP_FACECAM_BOTTOM' | 'FACECAM_TOP_MAIN_BOTTOM'

// 0-1 normalizado, relativo às dimensões do vídeo FONTE (não do canvas de
// saída) — mesma convenção da detecção de facecam existente.
export interface SplitLayoutRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface SplitLayoutConfig {
  facecamRegion: SplitLayoutRegion
  facecamZoom: number // 1.0 = sem zoom extra
  splitRatio: number // fração 0-1 da altura ocupada pelo painel de CIMA
}

export const SPLIT_LAYOUT_LABELS: Record<SplitLayoutMode, string> = {
  MAIN_TOP_FACECAM_BOTTOM: 'Principal em cima + Facecam com zoom embaixo',
  FACECAM_TOP_MAIN_BOTTOM: 'Facecam em cima + Principal embaixo',
}

// Canto inferior direito, ~28% do quadro — mesma convenção de "canto comum
// de webcam" já usada como fallback no crop manual de facecam do Template
// Studio. splitRatio default varia por modo (50% principal-topo, 45%
// facecam-topo) — aplicado onde o modo é escolhido, não aqui.
export const DEFAULT_SPLIT_LAYOUT_CONFIG: SplitLayoutConfig = {
  facecamRegion: { x: 0.7, y: 0.65, width: 0.28, height: 0.28 },
  facecamZoom: 1.3,
  splitRatio: 0.5,
}

export const DEFAULT_SPLIT_RATIO_BY_MODE: Record<SplitLayoutMode, number> = {
  MAIN_TOP_FACECAM_BOTTOM: 0.5,
  FACECAM_TOP_MAIN_BOTTOM: 0.45,
}

export interface EditorState {
  textOverlays: TextOverlay[]
  captions: CaptionSegment[]
  captionStyle: CaptionStyle
  effects: Effect[]
  // Marca se o usuário já pediu geração de legendas ao menos uma vez —
  // evita chamadas repetidas de Whisper sem necessidade na UI.
  captionsGeneratedAt?: string
  // null explícito = "layout normal, sem split" (permite desligar depois de
  // já ter ligado uma vez, diferente de undefined = "nunca configurado").
  layoutMode?: SplitLayoutMode | null
  layoutConfig?: SplitLayoutConfig
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 52,
  color: '#FFFFFF',
  highlightColor: '#FFE400',
  strokeColor: '#000000',
  position: 'bottom',
  fontFamily: DEFAULT_FONT_FAMILY,
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  textOverlays: [],
  captions: [],
  captionStyle: DEFAULT_CAPTION_STYLE,
  effects: [],
}

export interface AISuggestedClip {
  title: string
  startTime: string
  endTime: string
  viralScore: number
  hook: string
  reason: string
  emotion: ClipEmotion
  caption: string
  description: string
  hashtags: string[]
}

export interface ProcessingStatus {
  step: string
  label: string
  progress: number
  done: boolean
}

export const EMOTION_LABELS: Record<ClipEmotion, string> = {
  POLEMICA: 'Polêmica',
  HUMOR: 'Humor',
  SURPRESA: 'Surpresa',
  ENSINO: 'Ensinamento',
  HISTORIA: 'História',
  OPINIAO_FORTE: 'Opinião Forte',
  REVELACAO: 'Revelação',
  CONFLITO: 'Conflito',
  FRASE_DE_IMPACTO: 'Frase de Impacto',
}

export const EMOTION_COLORS: Record<ClipEmotion, string> = {
  POLEMICA: 'bg-red-500/20 text-red-400 border-red-500/30',
  HUMOR: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  SURPRESA: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ENSINO: 'bg-green-500/20 text-green-400 border-green-500/30',
  HISTORIA: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  OPINIAO_FORTE: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  REVELACAO: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  CONFLITO: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  FRASE_DE_IMPACTO: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
}

export const VIDEO_STATUS_STEPS: Record<VideoStatus, { label: string; step: number }> = {
  PENDING:          { label: 'Aguardando...', step: 0 },
  UPLOADING:        { label: 'Enviando vídeo...', step: 1 },
  IMPORTING:        { label: 'Importando vídeo...', step: 2 },
  AWAITING_LOCAL_DOWNLOAD: { label: 'Aguardando download local...', step: 2 },
  EXTRACTING_AUDIO: { label: 'Extraindo áudio...', step: 3 },
  TRANSCRIBING:     { label: 'Transcrevendo...', step: 4 },
  ANALYZING:        { label: 'Detectando melhores momentos...', step: 5 },
  COMPLETED:        { label: 'Concluído!', step: 6 },
  FAILED:           { label: 'Falhou', step: -1 },
}
