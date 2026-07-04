import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  label: string
  value: string | number
  tone?: 'violet' | 'neon'
  trend?: string
}

// Extraído do padrão que já existia inline no dashboard — ícone num box
// colorido + label + número grande. tone='neon' pra métricas de destaque
// (ex.: cortes agendados/publicados).
export function StatCard({ icon: Icon, label, value, tone = 'violet', trend }: Props) {
  const iconBg = tone === 'neon' ? 'bg-neon-500/15' : 'bg-violet-500/15'
  const iconColor = tone === 'neon' ? 'text-neon-400' : 'text-violet-400'

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
        </div>
        <span className="text-white/50 text-sm truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-bold">{value}</p>
        {trend && <span className="text-xs text-white/30">{trend}</span>}
      </div>
    </div>
  )
}
