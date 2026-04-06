import { cn } from '@/lib/utils'
import type { TaskStatus, ModelProvider } from '@/types'
import { STATUS_LABEL, STATUS_COLOR, PROVIDER_LABEL, PROVIDER_COLOR } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  color?: string
  className?: string
}

export function Badge({ children, color, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        className,
      )}
      style={color ? { backgroundColor: color + '1A', color } : undefined}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const color = STATUS_COLOR[status]
  const isActive = ['running', 'verifying', 'fixing'].includes(status)
  return (
    <Badge color={color}>
      {isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
          style={{ backgroundColor: color }}
        />
      )}
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function ProviderBadge({ provider }: { provider: ModelProvider }) {
  return (
    <Badge color={PROVIDER_COLOR[provider]}>
      {PROVIDER_LABEL[provider]}
    </Badge>
  )
}
