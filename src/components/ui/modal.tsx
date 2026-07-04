'use client'

import { X } from 'lucide-react'

interface Props {
  onClose?: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: string
  closable?: boolean
}

// Casca padrão de modal (backdrop + painel glass + botão de fechar) —
// substitui o backdrop/painel que cada modal (FormatPickerModal,
// ScheduleModal, ExportModal) reconstruía do zero com as mesmas classes.
export function Modal({ onClose, title, children, maxWidth = 'max-w-md', closable = true }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && closable && onClose?.()}
    >
      <div className={`glass rounded-2xl p-6 w-full ${maxWidth} space-y-5 border border-white/10 animate-scale-in max-h-[90vh] overflow-y-auto`}>
        {(title || closable) && (
          <div className="flex items-center justify-between">
            {title && <h2 className="font-semibold text-lg">{title}</h2>}
            {closable && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors ml-auto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
