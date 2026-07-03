import type { SourcePlatform } from '@/types'

/**
 * Detects the source platform from a URL's domain. Returns null only for a
 * malformed URL — an unrecognized-but-valid domain falls back to 'OTHER'
 * since yt-dlp supports far more sites than we enumerate explicit UI badges
 * for.
 */
export function detectPlatform(url: string): SourcePlatform | null {
  let hostname: string
  let pathname: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    pathname = parsed.pathname
  } catch {
    return null
  }

  if (hostname === 'youtube.com' || hostname === 'youtu.be' || hostname.endsWith('.youtube.com')) return 'YOUTUBE'
  if (hostname === 'twitch.tv' || hostname.endsWith('.twitch.tv')) return 'TWITCH'
  if (hostname === 'kick.com' || hostname.endsWith('.kick.com')) return 'KICK'
  if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'TIKTOK'
  if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) return 'INSTAGRAM'
  if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch') return 'FACEBOOK'
  if (/\.(mp4|mov|webm|mkv|m3u8)$/i.test(pathname)) return 'DIRECT_URL'

  return 'OTHER'
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
