'use client'

import type { SplitLayoutConfig, SplitLayoutMode } from '@/types'
import { DEFAULT_SPLIT_LAYOUT_CONFIG, DEFAULT_SPLIT_RATIO_BY_MODE } from '@/types'

export interface FacecamResolution {
  // true = região veio de detecção automática (IA) bem-sucedida — false =
  // caiu no palpite padrão (canto inferior direito), quem chama decide se
  // bloqueia a geração ou segue com o palpite.
  confirmed: boolean
  layoutConfig: SplitLayoutConfig
}

// Tenta detectar a facecam de verdade (Claude Vision, ver
// src/lib/facecam-detector.ts) antes de aplicar um layout com facecam.
// Compartilhado entre clip-card.tsx e clips-grid.tsx pra não duplicar a
// mesma chamada de detecção + fallback em dois lugares.
export async function resolveFacecamLayout(clipId: string, layoutMode: SplitLayoutMode): Promise<FacecamResolution> {
  let facecamRegion = DEFAULT_SPLIT_LAYOUT_CONFIG.facecamRegion
  let confirmed = false
  try {
    const res = await fetch(`/api/clips/${clipId}/detect-facecam`, { method: 'POST' })
    const body = await res.json().catch(() => null)
    if (res.ok && body?.detected && body.region) {
      facecamRegion = body.region
      confirmed = true
    }
  } catch {
    // segue com o palpite padrão — falha de detecção não deve travar a geração
  }
  return {
    confirmed,
    layoutConfig: {
      ...DEFAULT_SPLIT_LAYOUT_CONFIG,
      facecamRegion,
      facecamConfirmed: confirmed,
      splitRatio: DEFAULT_SPLIT_RATIO_BY_MODE[layoutMode],
    },
  }
}

export async function saveClipLayout(clipId: string, layoutMode: SplitLayoutMode, layoutConfig: SplitLayoutConfig) {
  await fetch(`/api/clips/${clipId}/editor`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layoutMode, layoutConfig }),
  }).catch(() => {})
}
