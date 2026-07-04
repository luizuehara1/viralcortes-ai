type BadgeTone = 'neutral' | 'success' | 'error' | 'warning' | 'violet' | 'neon' | 'info'

interface Props {
  children: React.ReactNode
  tone?: BadgeTone
  dot?: boolean
  className?: string
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-white/8 text-white/60',
  success: 'bg-green-500/15 text-green-400',
  error: 'bg-red-500/15 text-red-400',
  warning: 'bg-amber-500/15 text-amber-400',
  violet: 'bg-violet-500/15 text-violet-400',
  neon: 'bg-neon-500/15 text-neon-400',
  info: 'bg-blue-500/15 text-blue-400',
}

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-white/40',
  success: 'bg-green-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  violet: 'bg-violet-400',
  neon: 'bg-neon-400',
  info: 'bg-blue-400',
}

// Padroniza as pills de status ("bg-green-500/15 text-green-400" etc.) que
// hoje são recriadas manualmente em cada card/lista — mesma paleta de
// antes, só centralizada.
export function Badge({ children, tone = 'neutral', dot = false, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${TONE_CLASSES[tone]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASSES[tone]}`} />}
      {children}
    </span>
  )
}
