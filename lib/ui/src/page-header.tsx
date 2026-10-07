import type { ReactNode } from 'react'
import { cn } from './cn'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleStyle = 'standard',
  descriptionWidth = '2xl',
  compactDescription = false,
}: {
  eyebrow: ReactNode
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
  titleStyle?: 'standard' | 'strong'
  descriptionWidth?: 'none' | '2xl' | '3xl'
  compactDescription?: boolean
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1
          className={cn(
            'text-3xl tracking-tight',
            titleStyle === 'strong' ? 'mt-1 font-black' : 'mt-2 font-extrabold',
          )}
        >
          {title}
        </h1>
        <p
          className={cn(
            'mt-2 text-sm text-muted-foreground',
            !compactDescription && 'leading-6',
            descriptionWidth === '2xl' && 'max-w-2xl',
            descriptionWidth === '3xl' && 'max-w-3xl',
          )}
        >
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex gap-2 self-start sm:self-auto">{actions}</div>
      )}
    </header>
  )
}
