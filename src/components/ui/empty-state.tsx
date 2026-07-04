import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

// Estado vazio padrão — antes cada tela (dashboard, projetos, agendados,
// etc.) desenhava seu próprio "nada aqui ainda" com classes ligeiramente
// diferentes. Ícone dentro de um círculo com glow roxo suave.
export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="glass rounded-2xl p-12 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-1">
        <Icon className="w-6 h-6 text-violet-400" />
      </div>
      <p className="font-medium text-white/80">{title}</p>
      {description && <p className="text-sm text-white/40 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
