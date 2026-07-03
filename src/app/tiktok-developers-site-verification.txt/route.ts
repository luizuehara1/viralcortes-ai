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
