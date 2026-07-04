import { ScheduledPostsList } from '@/components/social/scheduled-posts-list'

export default function AgendamentosPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agendamentos</h1>
        <p className="text-white/50 text-sm mt-1">Acompanhe as publicações agendadas nas suas redes conectadas.</p>
      </div>
      <ScheduledPostsList />
    </div>
  )
}
