'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Scissors, LayoutDashboard, FolderOpen, LogOut, Wand2, Link2, Menu, X, Clapperboard, CalendarClock } from 'lucide-react'

interface Props {
  user: { name?: string; email?: string; image?: string }
}

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projetos', icon: FolderOpen },
  { href: '/editor', label: 'Editor', icon: Clapperboard },
  { href: '/template-studio', label: 'Template Studio', icon: Wand2 },
  { href: '/agendamentos', label: 'Agendamentos', icon: CalendarClock },
  { href: '/integrations', label: 'Integrações', icon: Link2 },
]

export function DashboardNav({ user }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const initials = (user.name || user.email || '?').slice(0, 2).toUpperCase()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-brand transition-transform group-hover:scale-105">
              <Scissors className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold">
              <span className="gradient-text">ViralCortes</span>
              <span className="text-white/40 text-sm font-normal"> AI</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border-b-2 transition-colors ${
                  isActive(l.href) ? 'text-white bg-white/5 border-violet-500' : 'text-white/50 border-transparent hover:text-white hover:bg-white/5'
                }`}
              >
                <l.icon className={`w-4 h-4 ${isActive(l.href) ? 'text-violet-400' : ''}`} />
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 pl-1 pr-3 py-1 rounded-full glass text-sm">
            <div className="w-6 h-6 rounded-full bg-gradient-brand flex items-center justify-center text-[10px] font-bold shrink-0">
              {initials}
            </div>
            <span className="text-white/60 max-w-[140px] truncate">{user.name || user.email}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg hover:bg-white/8 text-white/70 transition-colors"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#0a0a0f]/95 backdrop-blur-xl px-4 py-3 space-y-1 animate-fade-in">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(l.href) ? 'bg-violet-500/15 text-violet-300' : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <l.icon className="w-4 h-4" />
              {l.label}
            </Link>
          ))}
          <div className="flex items-center justify-between px-3 py-2.5 mt-2 border-t border-white/5 pt-3">
            <span className="text-xs text-white/40 truncate">{user.name || user.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
