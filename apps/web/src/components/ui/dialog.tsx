import { useEffect, type ReactNode } from 'react'
import { cn } from './cn'

export function Dialog({
  open,
  onOpenChange,
  dismissible = true,
  title,
  description,
  icon,
  size = 'md',
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dismissible?: boolean
  title: string
  description: string
  icon?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open || !dismissible) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dismissible, onOpenChange, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-xs"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) {
          onOpenChange(false)
        }
      }}
    >
      <div
        className={cn(
          'max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl',
          size === 'md' && 'max-w-md',
          size === 'lg' && 'max-w-2xl',
          size === 'xl' && 'max-w-4xl',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        <div className="flex items-start gap-4">
          {icon}
          <div>
            <h2 id="dialog-title" className="text-lg font-bold">
              {title}
            </h2>
            <p
              id="dialog-description"
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">{children}</div>
      </div>
    </div>
  )
}
