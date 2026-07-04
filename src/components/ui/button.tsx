'use client'

import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'glass' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-gradient-brand text-white shadow-brand hover:shadow-brand-lg hover:brightness-110 active:brightness-95',
  secondary: 'bg-white/8 hover:bg-white/12 text-white border border-white/10',
  glass: 'glass hover:bg-white/8 text-white/80 hover:text-white',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  ghost: 'text-white/50 hover:text-white hover:bg-white/5',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3.5 text-base gap-2.5',
}

// Botão base do design system — centraliza os 5 estilos que já existiam
// espalhados como classes Tailwind repetidas em cada tela (primary =
// bg-violet-600, secondary = glass, etc). Trocar de estilo aqui reflete em
// todo o app de uma vez, em vez de precisar caçar cada ocorrência.
export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', loading, icon, disabled, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
