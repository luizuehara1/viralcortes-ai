import { Youtube, Twitch, Instagram, Facebook, LinkIcon, Video } from 'lucide-react'
import type { SourcePlatform } from '@/types'

// TikTok e Kick não têm ícone de marca no lucide-react — usa um ícone
// genérico de vídeo com a cor da marca em vez de deixar sem ícone nenhum.
const PLATFORM_ICONS: Record<SourcePlatform, typeof Youtube> = {
  YOUTUBE: Youtube,
  TWITCH: Twitch,
  KICK: Video,
  TIKTOK: Video,
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  DIRECT_URL: LinkIcon,
  OTHER: LinkIcon,
}

const PLATFORM_COLORS: Record<SourcePlatform, string> = {
  YOUTUBE: 'text-red-500',
  TWITCH: 'text-purple-400',
  KICK: 'text-green-400',
  TIKTOK: 'text-white',
  INSTAGRAM: 'text-pink-400',
  FACEBOOK: 'text-blue-400',
  DIRECT_URL: 'text-white/50',
  OTHER: 'text-white/50',
}

interface Props {
  platform: SourcePlatform
  label: string
  active?: boolean
  onClick?: () => void
}

// Botão de plataforma com ícone de marca + estado ativo — usado no
// seletor de "importar por link" (YouTube/Twitch/Kick/TikTok/Instagram/
// Facebook) em vez de badges de texto puro.
export function PlatformIconButton({ platform, label, active, onClick }: Props) {
  const Icon = PLATFORM_ICONS[platform]
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-colors ${
        active ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-white/10 text-white/40 hover:bg-white/5 hover:text-white/70'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? PLATFORM_COLORS[platform] : ''}`} />
      {label}
    </button>
  )
}
