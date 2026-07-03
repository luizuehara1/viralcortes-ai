import { prisma } from './prisma'
import type { ScheduledPost } from '@prisma/client'

// Resolve o filePath em disco por trás de um ScheduledPost — sourceId aponta
// pro RenderedClip exato escolhido ao agendar (não o SuggestedClip, já que
// um clipe pode ter vários formatos renderizados) ou pro TemplateOutput,
// dependendo de sourceType. Compartilhado entre a rota pública
// (/api/public/media/[token], usada pelo video_url do Instagram) e o worker
// de publicação (upload direto pro YouTube não passa por essa rota).
export async function resolveScheduledPostFilePath(post: Pick<ScheduledPost, 'sourceType' | 'sourceId'>): Promise<string | null> {
  if (post.sourceType === 'CLIP') {
    const rendered = await prisma.renderedClip.findUnique({ where: { id: post.sourceId } })
    return rendered?.filePath ?? null
  }

  const output = await prisma.templateOutput.findUnique({ where: { id: post.sourceId } })
  return output?.filePath ?? null
}
