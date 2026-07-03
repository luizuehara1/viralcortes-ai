import { NextRequest, NextResponse } from 'next/server'

// Autentica o script downloader local (roda no PC do dono, fora do Railway)
// contra as rotas /api/local-downloader/* — não usa sessão de usuário
// porque não é um navegador, é um processo standalone rodando em outra
// máquina. Um token fixo compartilhado é suficiente aqui: só uma pessoa
// (o dono do app) roda esse script, contra o próprio servidor dela.
export function authorizeLocalDownloader(req: NextRequest): NextResponse | null {
  const expected = process.env.LOCAL_DOWNLOADER_TOKEN
  if (!expected) {
    return NextResponse.json({ error: 'LOCAL_DOWNLOADER_TOKEN não configurado no servidor' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== expected) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  return null
}
