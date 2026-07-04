import { getServerSession } from 'next-auth'
import fs from 'fs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { TemplateOutputEditor } from '@/components/editor/template-output-editor'
import { MediaMissingNotice } from '@/components/editor/media-missing-notice'
import { DEFAULT_EDITOR_STATE, type EditorState, type SplitLayoutConfig } from '@/types'
import { withDefaultVideoLayer } from '@/lib/editor-state'

interface Props {
  params: { id: string }
}

export const dynamic = 'force-dynamic'

export default async function TemplateOutputEditorPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id

  const output = await prisma.templateOutput.findFirst({
    where: { id: params.id, userId },
  })

  if (!output || output.mediaType !== 'VIDEO' || !output.duration) notFound()

  // O registro existe, mas o arquivo pode ter sumido do disco (armazenamento
  // local efêmero) — sem isso, o player carrega preto e só um erro confuso
  // aparece depois, ao tentar gerar legenda.
  if (!fs.existsSync(output.filePath)) {
    return <MediaMissingNotice backHref="/template-studio" backLabel="Voltar ao Template Studio" />
  }

  // Ver comentário equivalente em clips/[id]/editor/page.tsx — sem isso, a
  // caixa de seleção/arraste do vídeo no preview nunca aparece.
  const editorState = withDefaultVideoLayer(
    (output.editorState as EditorState | null) || DEFAULT_EDITOR_STATE,
    output.duration || 0
  )
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastSplitLayoutConfig: true } })

  return (
    <div className="max-w-6xl mx-auto animate-in">
      <TemplateOutputEditor
        output={{ id: output.id, duration: output.duration, caption: output.caption }}
        initialEditorState={editorState}
        lastSplitLayoutConfig={(user?.lastSplitLayoutConfig as SplitLayoutConfig | null) ?? null}
      />
    </div>
  )
}
