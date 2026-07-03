import { NextRequest, NextResponse } from 'next/server'

// Webhook público da Meta/Instagram — rota separada do OAuth
// (/api/auth/instagram/callback, que continua intocado). Não exige sessão,
// não redireciona, nunca retorna HTML: só texto puro (verificação) ou JSON (POST).
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'viralcortes_meta_verify_2026'

// Handshake de verificação que a Meta faz ao salvar a Callback URL no painel.
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[webhooks/meta] Verificação recusada — hub.mode:', mode ?? '(ausente)', '| token confere?', token === VERIFY_TOKEN)
  return new NextResponse('Forbidden', { status: 403 })
}

// Eventos do webhook (mensagens, comentários etc.) — por enquanto só loga de
// forma segura (sem tokens/segredos) e confirma recebimento. A Meta espera
// um 200 rápido, senão passa a re-tentar e pode suspender a subscription.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const entryCount = Array.isArray(body?.entry) ? body.entry.length : 0
    const fields = Array.isArray(body?.entry)
      ? Array.from(new Set(body.entry.flatMap((e: any) => (e?.changes ?? []).map((c: any) => c?.field)).filter(Boolean)))
      : []
    console.log('[webhooks/meta] Evento recebido | object:', body?.object ?? '(desconhecido)', '| entries:', entryCount, '| fields:', fields)
  } catch (err) {
    console.error('[webhooks/meta] Falha ao processar payload do evento:', (err as Error).message)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
