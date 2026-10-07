import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    >
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-bold tracking-[-0.01em]">{title}</h2>
          {description && (
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}
