import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Clapperboard, Pencil, Wand2 } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmptyState } from '@/components/ui/empty-state'
import { EditorUploadCard } from '@/components/editor/editor-upload-card'

export const dynamic = 'force-dynamic'

// Hub do "Editor" — o item de menu não tem um destino único (o editor
// sempre trabalha em cima de UM corte ou UM resultado de template), então
// essa tela deixa escolher qual abrir, em vez de ser um beco sem saída.
export default async function EditorHubPage() {
  const session = await getServerSession(authOptions)
  const userId = (session!.user as any).id

  const [clips, outputs] = await Promise.all([
    prisma.suggestedClip.findMany({
      where: { sourceVideo: { project: { userId } }, status: { in: ['SELECTED', 'RENDERED'] } },
      select: { id: true, title: true, updatedAt: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    }),
    prisma.templateOutput.findMany({
      where: { userId, mediaType: 'VIDEO' },
      select: { id: true, caption: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ])

  const isEmpty = clips.length === 0 && outputs.length === 0

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-violet-400" />
          Editor
        </h1>
        <p className="text-white/50 text-sm mt-1">Escolha um corte ou resultado de template pra editar — camadas, zoom, crop, legendas e efeitos.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-white/60">Começar uma edição</h2>
          <p className="text-xs text-white/30 mt-0.5">Envie um vídeo do seu computador ou escolha um resultado já gerado.</p>
        </div>
        <EditorUploadCard />
      </section>

      {isEmpty && (
        <EmptyState
          icon={Clapperboard}
          title="Nada pra continuar ainda"
          description="Gere um corte num projeto ou monte um resultado no Template Studio — ou envie um vídeo acima pra começar do zero."
        />
      )}

      {clips.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/60">Cortes gerados</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clips.map((clip) => (
              <Link
                key={clip.id}
                href={`/clips/${clip.id}/editor`}
                className="glass rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-white/8 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{clip.title}</p>
                  <p className="text-xs text-white/30">{new Date(clip.updatedAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <Pencil className="w-4 h-4 text-white/30 group-hover:text-violet-300 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {outputs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/60">Resultados de template</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outputs.map((output) => (
              <Link
                key={output.id}
                href={`/template-outputs/${output.id}/editor`}
                className="glass rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-white/8 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{output.caption || 'Sem legenda'}</p>
                  <p className="text-xs text-white/30">{new Date(output.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <Pencil className="w-4 h-4 text-white/30 group-hover:text-violet-300 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link
        href="/template-studio"
        className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
      >
        <Wand2 className="w-3.5 h-3.5" />
        Ou monte um novo resultado no Template Studio
      </Link>
    </div>
  )
}
