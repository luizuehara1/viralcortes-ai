'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Scissors, LayoutDashboard, FolderOpen, LogOut, User, Wand2, Link2 } from 'lucide-react'

interface Props {
  user: { name?: string; email?: string; image?: string }
}

export function DashboardNav({ user }: Props) {
  const pathname = usePathname()

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projetos', icon: FolderOpen },
    { href: '/template-studio', label: 'Template Studio', icon: Wand2 },
    { href: '/integrations', label: 'Integrações', icon: Link2 },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Scissors className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold">
              <span className="gradient-text">ViralCortes</span>
              <span className="text-white/40 text-sm font-normal"> AI</span>
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === l.href || pathname.startsWith(l.href + '/')
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                <l.icon className="w-4 h-4" />
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg glass text-sm">
            <User className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white/60 max-w-[140px] truncate">{user.name || user.email}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
