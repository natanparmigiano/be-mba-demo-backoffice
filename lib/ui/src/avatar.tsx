import { cn } from './cn'

export function Avatar({
  name,
  size = 'md',
  status,
  statusLabel,
  className,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  status?: 'online' | 'away' | 'offline'
  statusLabel?: string
  className?: string
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const sizes = {
    sm: 'size-7 text-[10px]',
    md: 'size-9 text-xs',
    lg: 'size-12 text-sm',
    xl: 'size-16 text-lg',
  }
  const statusColors = {
    online: 'bg-success',
    away: 'bg-warning',
    offline: 'bg-muted-foreground',
  }

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'grid place-items-center rounded-full bg-linear-to-br from-primary/20 to-accent/25 font-bold text-primary ring-1 ring-primary/10',
          sizes[size],
        )}
        aria-label={name}
        title={name}
      >
        {initials}
      </span>
      {status && (
        <span
          className={cn(
            'absolute right-0 bottom-0 size-3 rounded-full border-2 border-card',
            statusColors[status],
          )}
          aria-label={statusLabel ?? status}
        />
      )}
    </span>
  )
}
