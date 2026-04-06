import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const baseInput = [
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)]',
  'bg-[var(--color-surface)] text-[var(--color-foreground)]',
  'placeholder:text-[var(--color-muted)] text-sm',
  'transition-colors duration-150',
  'focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helper?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helper, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-foreground)]">
            {label}
            {props.required && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(baseInput, 'h-9 px-3', error && 'border-[var(--color-destructive)] focus:ring-[var(--color-destructive)]', className)}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-[var(--color-destructive)]" role="alert">
            {error}
          </p>
        )}
        {!error && helper && (
          <p id={`${inputId}-helper`} className="text-xs text-[var(--color-muted)]">
            {helper}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  helper?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, helper, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-foreground)]">
            {label}
            {props.required && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(baseInput, 'px-3 py-2 resize-y min-h-24', error && 'border-[var(--color-destructive)]', className)}
          aria-invalid={!!error}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--color-destructive)]" role="alert">{error}</p>
        )}
        {!error && helper && (
          <p className="text-xs text-[var(--color-muted)]">{helper}</p>
        )}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  helper?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, helper, error, id, children, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-foreground)]">
            {label}
            {props.required && <span className="ml-1 text-[var(--color-destructive)]">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(baseInput, 'h-9 px-3 cursor-pointer', error && 'border-[var(--color-destructive)]', className)}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-[var(--color-destructive)]" role="alert">{error}</p>}
        {!error && helper && <p className="text-xs text-[var(--color-muted)]">{helper}</p>}
      </div>
    )
  },
)
Select.displayName = 'Select'
