import { DEFAULT_CAPTION_STYLE, DEFAULT_EDITOR_STATE, type EditorState } from '@/types'

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
  }
}
