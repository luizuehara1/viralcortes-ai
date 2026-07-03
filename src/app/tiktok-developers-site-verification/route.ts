// Verificação de domínio do TikTok Developers — texto puro, sem layout do
// app, sem autenticação (não há middleware.ts no projeto, então nada
// intercepta esta rota).
export async function GET() {
  return new Response(
    'tiktok-developers-site-verification=vmKBGMQo9tKGkkV2Rs8eIXfwOxfSMLGs',
    {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
}
