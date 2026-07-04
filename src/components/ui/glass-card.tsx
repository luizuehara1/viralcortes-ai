import Link from 'next/link'

interface Props {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: boolean
  href?: string
  onClick?: () => void
}

// Wrapper único pro padrão "glass rounded-2xl p-5" repetido em quase todo
// arquivo do app — glow adiciona uma borda com brilho roxo sutil (usado em
// cards de destaque, ex.: plano ativo, corte com maior pontuação viral).
export function GlassCard({ children, className = '', hover = false, glow = false, href, onClick }: Props) {
  const classes = `${hover ? 'glass-hover' : 'glass'} rounded-2xl ${glow ? 'ring-1 ring-violet-500/30 shadow-brand' : ''} ${className}`

  if (href) {
    return (
      <Link href={href} className={`${classes} block`}>
        {children}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={`${classes} text-left w-full`}>
        {children}
      </button>
    )
  }

  return <div className={classes}>{children}</div>
}
