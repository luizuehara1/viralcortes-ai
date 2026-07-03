import { getServerSession } from 'next-auth'
import fs from 'fs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ClipEditor } from '@/components/editor/clip-editor'
import { MediaMissingNotice } from '@/components/editor/media-missing-notice'
import { DEFAULT_EDITOR_STATE, type EditorState } from '@/types'

interface Props {
  params: { id: string }
}

export const dynamic = 'force-dynamic'

export default async function ClipEditorPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id

  const clip = await prisma.suggestedClip.findFirst({
    where: { id: params.id, sourceVideo: { project: { userId } } },
    include: { sourceVideo: { select: { id: true, filePath: true, duration: true, projectId: true } } },
  })

  if (!clip || !clip.sourceVideo.filePath) notFound()

  // O registro existe, mas o arquivo pode ter sumido do disco (armazenamento
  // local efêmero) — sem isso, o player carrega preto e só um erro confuso
  // aparece depois, ao tentar gerar legenda.
  if (!fs.existsSync(clip.sourceVideo.filePath)) {
    return <MediaMissingNotice backHref={`/projects/${clip.sourceVideo.projectId}`} backLabel="Voltar ao projeto" />
  }

  const editorState = (clip.editorState as EditorState | null) || DEFAULT_EDITOR_STATE

  return (
    <div className="max-w-6xl mx-auto animate-in">
      <ClipEditor
        clip={{
          id: clip.id,
          title: clip.title,
          startTime: clip.startTime,
          endTime: clip.endTime,
        }}
        sourceVideoId={clip.sourceVideo.id}
        projectId={clip.sourceVideo.projectId}
        initialEditorState={editorState}
      />
    </div>
  )
}
