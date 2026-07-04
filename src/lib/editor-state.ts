import {
  DEFAULT_CAPTION_STYLE, DEFAULT_EDITOR_STATE, DEFAULT_LAYER_TRANSFORM,
  type EditorState, type EditorLayer,
} from '@/types'

// Compartilhado entre a rota de autosave (editor/route.ts) e a de geração de
// legendas (captions/route.ts) — ambas fazem merge parcial em cima do
// editorState já salvo no clipe, nunca sobrescrevem o blob inteiro.
export function mergeEditorState(existing: unknown, updates: Partial<EditorState>): EditorState {
  const base = (existing as EditorState | null) || DEFAULT_EDITOR_STATE
  return {
    textOverlays: updates.textOverlays ?? base.textOverlays ?? [],
    captions: updates.captions ?? base.captions ?? [],
    captionStyle: updates.captionStyle ?? base.captionStyle ?? DEFAULT_CAPTION_STYLE,
    effects: updates.effects ?? base.effects ?? [],
    captionsGeneratedAt: updates.captionsGeneratedAt ?? base.captionsGeneratedAt,
    // layoutMode pode ser explicitamente `null` (desligar o split) — "??"
    // trataria null como ausente e cairia pro valor antigo, por isso checa
    // presença da chave em vez de usar nullish coalescing aqui.
    layoutMode: 'layoutMode' in updates ? updates.layoutMode : base.layoutMode,
    layoutConfig: updates.layoutConfig ?? base.layoutConfig,
    transform: updates.transform ?? base.transform,
    layers: updates.layers ?? base.layers,
  }
}

// Só usada nas rotas GET do editor (nunca no PATCH/mergeEditorState) — sintetiza
// uma camada VIDEO a partir do `transform` legado quando o corte ainda não foi
// aberto no editor de camadas novo. É só de leitura: nunca grava no banco
// sozinha, e como deriva sempre do mesmo `transform`, o render fica idêntico
// esteja o corte usando `layers` (usuário já mexeu) ou o fallback legado
// (nunca mexeu) — sem migração, sem backfill, zero risco pras linhas antigas.
export function withDefaultVideoLayer(state: EditorState, duration: number): EditorState {
  if (state.layers?.length) return state
  const legacy = state.transform
  const layer: EditorLayer = {
    id: 'video-main',
    type: 'VIDEO',
    name: 'Vídeo principal',
    visible: true,
    locked: false,
    startTime: 0,
    endTime: duration,
    zIndex: 0,
    transform: {
      ...DEFAULT_LAYER_TRANSFORM,
      x: legacy?.positionX ?? 0,
      y: legacy?.positionY ?? 0,
      scale: legacy?.zoom ?? 1,
    },
  }
  return { ...state, layers: [layer] }
}
