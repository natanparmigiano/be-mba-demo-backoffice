import type { ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem<Value extends string> {
  value: Value
  label: string
  align?: 'start' | 'end'
  icon?: ReactNode
}

export function Tabs<Value extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  variant = 'underline',
  size = 'default',
  className,
}: {
  items: readonly TabItem<Value>[]
  value: Value
  onValueChange: (value: Value) => void
  ariaLabel: string
  variant?: 'underline' | 'pills'
  size?: 'default' | 'compact'
  className?: string
}) {
  return (
    <div
      className={cn(
        variant === 'underline' && 'border-b pb-1',
        variant === 'pills' && 'overflow-hidden border bg-card shadow-xs',
        variant === 'pills' && size === 'default' && 'rounded-2xl p-2',
        variant === 'pills' && size === 'compact' && 'rounded-xl p-1',
        className,
      )}
    >
      <div
        className="flex gap-1 overflow-x-auto"
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item, index) => (
          <button
            key={item.value}
            className={cn(
              'relative cursor-pointer font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
              size === 'default' && 'h-11 px-4 text-sm',
              size === 'compact' && 'h-8 px-3 text-xs',
              item.align === 'end' &&
                items[index - 1]?.align !== 'end' &&
                'ml-auto',
              variant === 'underline' &&
                'after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full',
              variant === 'underline' && value === item.value
                ? 'text-primary after:bg-primary'
                : variant === 'underline'
                  ? 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  : undefined,
              variant === 'pills' && size === 'default' && 'rounded-xl',
              variant === 'pills' && size === 'compact' && 'rounded-lg',
              variant === 'pills' && value === item.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : variant === 'pills'
                  ? 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  : undefined,
            )}
            type="button"
            role="tab"
            aria-selected={value === item.value}
            onClick={() => onValueChange(item.value)}
          >
            <span className="inline-flex items-center gap-2">
              {item.icon}
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
