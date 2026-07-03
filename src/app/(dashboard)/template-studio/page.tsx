import { TemplateStudioClient } from '@/components/template/template-studio-client'

export default function TemplateStudioPage() {
  return (
    <div className="max-w-3xl mx-auto animate-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Template Studio</h1>
        <p className="text-white/40 text-sm mt-1">
          Encaixe automaticamente uma foto ou vídeo na área azul do template
        </p>
      </div>
      <TemplateStudioClient />
    </div>
  )
}
