interface Props {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

// Extraído de clip-editor.tsx/template-output-editor.tsx, onde a mesma
// função estava duplicada nos dois arquivos.
export function TabButton({ active, onClick, icon, label }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
        active ? 'bg-gradient-brand text-white shadow-brand' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
