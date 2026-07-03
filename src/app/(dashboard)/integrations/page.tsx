import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { YoutubeConnectCard } from '@/components/integrations/youtube-connect-card'
import { InstagramConnectCard } from '@/components/integrations/instagram-connect-card'
import { ScheduledPostsList } from '@/components/social/scheduled-posts-list'

interface Props {
  searchParams: { error?: string; connected?: string }
}

const ACCOUNT_SELECT = {
  id: true,
  providerAccountId: true,
  accountName: true,
  accountAvatar: true,
  scope: true,
  expiresAt: true,
  updatedAt: true,
  metadata: true,
} as const

export default async function IntegrationsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  const userId = (session!.user as any).id

  const [youtube, instagram] = await Promise.all([
    prisma.socialAccount.findUnique({
      where: { userId_provider: { userId, provider: 'YOUTUBE' } },
      select: ACCOUNT_SELECT,
    }),
    prisma.socialAccount.findUnique({
      where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
      select: ACCOUNT_SELECT,
    }),
  ])

  const serialize = (account: (typeof youtube) | null) =>
    account
      ? {
          ...account,
          expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
          updatedAt: account.updatedAt.toISOString(),
          metadata: account.metadata as { pageId?: string; pageName?: string } | null,
        }
      : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-white/50 text-sm mt-1">Conecte suas redes para publicar os cortes direto do ViralCortes.</p>
      </div>

      {searchParams.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {searchParams.error}
        </div>
      )}
      {searchParams.connected === 'youtube' && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          YouTube conectado com sucesso!
        </div>
      )}
      {searchParams.connected === 'instagram' && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          Instagram conectado com sucesso!
        </div>
      )}

      <YoutubeConnectCard initialAccount={serialize(youtube)} />
      <InstagramConnectCard initialAccount={serialize(instagram)} />
      <ScheduledPostsList />
    </div>
  )
}
