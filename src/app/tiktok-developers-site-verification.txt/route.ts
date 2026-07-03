export async function GET() {
  return new Response(
    'tiktok-developers-site-verification=EZnVBtat59J9vN92LTS5rX8wwNnX7Wb5',
    {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
}
