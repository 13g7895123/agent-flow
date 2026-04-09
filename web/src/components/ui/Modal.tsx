import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = {
  sm:  'max-w-sm',
  md:  'max-w-lg',
  lg:  'max-w-2xl',
  xl:  'max-w-4xl',
}

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Scroll container */}
      <div
        className="fixed inset-0 z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Panel */}
          <div
            className={cn(
              'relative w-full bg-[var(--color-surface)] border border-[var(--color-border)]',
              'rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]',
              'animate-fade-in',
              sizeMap[size],
              className,
            )}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-base font-semibold">{title}</h2>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="關閉">
                <X size={16} />
              </Button>
            </div>
            <div className="p-6">{children}</div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
