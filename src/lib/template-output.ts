import { getVideoMetadata } from '@/lib/ffmpeg'
import { prisma } from '@/lib/prisma'

// Registra o resultado no banco (TemplateOutput) pra poder ser editado/
// legendado e agendado pro Instagram depois — antes só existia como arquivo
// solto em disco. Compartilhado entre /api/template/generate (encaixe em
// template ou "manter original") e /api/editor/upload (upload direto pro
// editor, sem passar por nenhum template).
export async function persistTemplateOutput(userId: string, outputPath: string, mediaType: 'image' | 'video') {
  const duration = mediaType === 'video' ? (await getVideoMetadata(outputPath)).duration : null
  const created = await prisma.templateOutput.create({
    data: {
      userId,
      filePath: outputPath,
      mediaType: mediaType === 'video' ? 'VIDEO' : 'IMAGE',
      duration,
    },
  })
  return created.id
}
