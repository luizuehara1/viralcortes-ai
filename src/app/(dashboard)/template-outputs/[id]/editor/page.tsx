import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { TemplateOutputEditor } from '@/components/editor/template-output-editor'
import { DEFAULT_EDITOR_STATE, type EditorState } from '@/types'

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

  const editorState = (output.editorState as EditorState | null) || DEFAULT_EDITOR_STATE

  return (
    <div className="max-w-6xl mx-auto animate-in">
      <TemplateOutputEditor
        output={{ id: output.id, duration: output.duration, caption: output.caption }}
        initialEditorState={editorState}
      />
    </div>
  )
}
