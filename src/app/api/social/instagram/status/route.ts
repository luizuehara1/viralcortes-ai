import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Retorna o estado salvo no banco (sem chamar a Graph API) — usado para
// pintar a tela de integrações rapidamente. Para validar ao vivo, ver /test.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const account = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
    select: {
      id: true,
      providerAccountId: true,
      accountName: true,
      accountAvatar: true,
      scope: true,
      expiresAt: true,
      updatedAt: true,
      metadata: true,
    },
  })

  return NextResponse.json({ connected: !!account, account })
}
