import type { ReactNode } from 'react'
import { cn } from '@mba-desk/ui'

export function SettingsCard({
  icon,
  title,
  description,
  action,
  disabled = false,
  bodyClassName,
  error,
  footer,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  disabled?: boolean
  bodyClassName?: string
  error?: string | null
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <fieldset
      className="overflow-hidden rounded-2xl border bg-card shadow-xs"
      disabled={disabled}
    >
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-bold">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {action}
      </div>
      <div
        className={cn(
          'grid gap-4 border-t bg-muted/10 p-5 sm:p-6',
          bodyClassName,
        )}
      >
        {children}
        {error && (
          <p
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
      {footer && (
        <div className="flex justify-end border-t bg-muted/10 p-5">
          {footer}
        </div>
      )}
    </fieldset>
  )
}
