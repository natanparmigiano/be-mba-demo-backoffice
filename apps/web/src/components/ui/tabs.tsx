import { cn } from './cn'

export interface TabItem<Value extends string> {
  value: Value
  label: string
}

export function Tabs<Value extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  items: readonly TabItem<Value>[]
  value: Value
  onValueChange: (value: Value) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      className={cn('flex gap-1 overflow-x-auto border-b', className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <button
          key={item.value}
          className={cn(
            'relative h-11 cursor-pointer px-4 text-sm font-semibold whitespace-nowrap transition-colors after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full',
            value === item.value
              ? 'text-primary after:bg-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
