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

export type EffectType = 'colorFilter' | 'zoomPan' | 'zoomPunch' | 'shake' | 'blur' | 'flash' | 'vignette' | 'sharpen' | 'grain' | 'rgbSplit'

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

// Efeitos "pesados" novos — todos com um único slider de intensidade
// (0-1), convertido pros parâmetros reais do filtro do FFmpeg na hora de
// montar o filtro (ver buildHeavyEffectFilter em ffmpeg.ts). Testados contra
// o binário real do ffmpeg antes de entrar (boxblur/vignette/unsharp/eq/
// noise/rgbashift — todos com suporte nativo a timeline via `enable`; shake
// e zoomPunch usam o mesmo truque de zoomPan de embutir a janela de tempo
// dentro da própria expressão, já que scale/crop não aceitam `enable`).
export interface IntensityEffectParams {
  intensity: number // 0-1
}

export interface Effect {
  id: string
  type: EffectType
  startTime: number
  endTime: number
  params: ColorFilterParams | ZoomPanParams | IntensityEffectParams
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
  // true = região veio de detecção automática (IA) bem-sucedida OU de ajuste
  // manual confirmado pelo usuário. false/undefined = ainda é só o palpite
  // padrão (canto inferior direito) — usado pra mostrar aviso de fallback
  // em vez de deixar o usuário achar que aquilo já foi detectado de verdade.
  facecamConfirmed?: boolean
  // Crop/zoom do painel PRINCIPAL — mesmo conceito de facecamRegion/
  // facecamZoom, só que pro vídeo de baixo (ou de cima, dependendo do modo).
  // Ausente = comportamento de sempre (frame inteiro, sem zoom, cover-crop
  // centralizado) — aditivo, não quebra configs salvas antes disso existir.
  mainRegion?: SplitLayoutRegion
  mainZoom?: number
}

// Região "frame inteiro" — usada como fallback quando mainRegion não foi
// definido ainda (configs salvas antes dessa função existir).
export const FULL_FRAME_REGION: SplitLayoutRegion = { x: 0, y: 0, width: 1, height: 1 }

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
  mainRegion: { ...FULL_FRAME_REGION },
  mainZoom: 1,
}

export const DEFAULT_SPLIT_RATIO_BY_MODE: Record<SplitLayoutMode, number> = {
  MAIN_TOP_FACECAM_BOTTOM: 0.5,
  FACECAM_TOP_MAIN_BOTTOM: 0.45,
}

// Zoom/posição manual do vídeo principal dentro do quadro de saída — reaproveita
// exatamente o "cover crop" que já existia (scale increase + crop centralizado),
// só que com o alvo de scale multiplicado por zoom e o ponto do crop deslocado
// por positionX/Y em vez de sempre centralizado. zoom=1,position=0,0 é
// idêntico ao fitMode COVER de hoje (compatível com o que já existe).
export interface VideoTransform {
  zoom: number // >=1 — 1 = sem zoom extra
  positionX: number // -1 a 1 — 0 = centralizado, -1 = extremo esquerdo, 1 = extremo direito
  positionY: number // -1 a 1 — 0 = centralizado, -1 = topo, 1 = base
}

export const DEFAULT_VIDEO_TRANSFORM: VideoTransform = { zoom: 1, positionX: 0, positionY: 0 }

// Sistema de camadas (base do editor estilo CapCut) — Etapa 1 implementa só a
// camada VIDEO. FACECAM/TEXT/CAPTION/IMAGE/EFFECT ficam reservados no tipo
// pras próximas etapas, ainda sem uso real.
export type LayerType = 'VIDEO' | 'FACECAM' | 'TEXT' | 'CAPTION' | 'IMAGE' | 'EFFECT'

export interface LayerTransform {
  // Convenção da camada VIDEO (única implementada por ora): x/y são um OFFSET
  // DE PAN -1 a 1 (0 = centralizado — mesma convenção de VideoTransform),
  // scale é o zoom de cover-fill (>=1, vídeo sempre preenche o quadro
  // inteiro). width/height ficam reservados (sempre 1 por ora) pra quando
  // existirem camadas com caixa de verdade (FACECAM/TEXT/IMAGE, etapas
  // futuras).
  x: number
  y: number
  width: number
  height: number
  scale: number
  // Guardados mas ainda NÃO aplicados no render — sem um compositor
  // multi-camada de verdade, rotação/opacidade não têm efeito visual
  // sozinhas com uma única camada de vídeo preenchendo tudo.
  rotation: number
  opacity: number
  // 0-1 normalizado ao vídeo FONTE (mesma convenção de SplitLayoutRegion) —
  // sub-retângulo recortado ANTES do scale/posição. (0,0,1,1) = sem crop.
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  x: 0, y: 0, width: 1, height: 1, scale: 1, rotation: 0, opacity: 1,
  cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1,
}

export interface EditorLayer {
  id: string
  type: LayerType
  name: string
  visible: boolean
  locked: boolean
  startTime: number
  endTime: number
  zIndex: number
  transform: LayerTransform
}

// Formato/resolução de saída escolhido no editor — nomes amigáveis (preset)
// em cima do MESMO ClipFormat que o render já usa (FORMAT_DIMENSIONS em
// ffmpeg.ts), então não precisa de nenhum código novo de render: só uma
// tradução preset -> ClipFormat na hora de gerar/exportar.
export type CanvasPreset = 'TIKTOK_9_16' | 'YOUTUBE_16_9' | 'SQUARE_1_1' | 'FEED_4_5' | 'ORIGINAL'

export interface EditorCanvas {
  preset: CanvasPreset
  width: number // 0 pra ORIGINAL — resolvido a partir do vídeo fonte na hora do render
  height: number
  aspectRatio: string
}

export const CANVAS_PRESETS: Record<CanvasPreset, EditorCanvas> = {
  TIKTOK_9_16: { preset: 'TIKTOK_9_16', width: 1080, height: 1920, aspectRatio: '9:16' },
  YOUTUBE_16_9: { preset: 'YOUTUBE_16_9', width: 1920, height: 1080, aspectRatio: '16:9' },
  SQUARE_1_1: { preset: 'SQUARE_1_1', width: 1080, height: 1080, aspectRatio: '1:1' },
  FEED_4_5: { preset: 'FEED_4_5', width: 1080, height: 1350, aspectRatio: '4:5' },
  ORIGINAL: { preset: 'ORIGINAL', width: 0, height: 0, aspectRatio: 'original' },
}

export const CANVAS_PRESET_LABELS: Record<CanvasPreset, string> = {
  TIKTOK_9_16: 'TikTok / Reels / Shorts — 9:16',
  YOUTUBE_16_9: 'YouTube — 16:9',
  SQUARE_1_1: 'Feed Quadrado — 1:1',
  FEED_4_5: 'Feed Vertical — 4:5',
  ORIGINAL: 'Original — manter resolução',
}

export const CANVAS_PRESET_TO_CLIP_FORMAT: Record<CanvasPreset, ClipFormat> = {
  TIKTOK_9_16: 'VERTICAL_9_16',
  YOUTUBE_16_9: 'HORIZONTAL_16_9',
  SQUARE_1_1: 'SQUARE_1_1',
  FEED_4_5: 'FEED_4_5',
  ORIGINAL: 'ORIGINAL',
}

// Padrão do editor: TikTok/Reels/Shorts 9:16, conforme pedido explícito.
export const DEFAULT_EDITOR_CANVAS: EditorCanvas = CANVAS_PRESETS.TIKTOK_9_16

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
  transform?: VideoTransform
  // Sistema de camadas (Etapa 1: só a camada VIDEO é usada de verdade).
  // Ausente/vazio = corte nunca aberto no editor de camadas novo — nesse
  // caso o render cai pro `transform` legado acima (ver renderClip).
  layers?: EditorLayer[]
  // Estado de seleção da UI — não entra no schema zod/autosave por ora
  // (com uma única camada não há o que persistir de seleção entre reloads).
  selectedLayerId?: string | null
  // Formato/resolução de saída — ausente = usa DEFAULT_EDITOR_CANVAS (TikTok
  // 9:16) tanto pro preview quanto pro render.
  canvas?: EditorCanvas
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
