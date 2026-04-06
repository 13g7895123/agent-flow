import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center">
        <Icon size={24} className="text-[var(--color-muted)]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-foreground)]">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
