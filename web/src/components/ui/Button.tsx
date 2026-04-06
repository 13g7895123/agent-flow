import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:scale-[0.98]',
  secondary:
    'bg-[var(--color-surface-2)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-muted-bg)] active:scale-[0.98]',
  ghost:
    'text-[var(--color-foreground)] hover:bg-[var(--color-muted-bg)] active:scale-[0.98]',
  danger:
    'bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive-hover)] active:scale-[0.98]',
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-[var(--radius-md)]',
        'transition-all duration-150 cursor-pointer select-none',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
