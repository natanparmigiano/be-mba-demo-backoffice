import { useId, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: string
  description?: string
}

export function Switch({
  className,
  label,
  description,
  id,
  ...props
}: SwitchProps) {
  const generatedId = useId()
  const switchId = id ?? generatedId

  return (
    <label
      className={cn(
        'group flex cursor-pointer items-center justify-between gap-4 text-sm',
        className,
      )}
      htmlFor={switchId}
    >
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </span>
      <input
        id={switchId}
        type="checkbox"
        className="peer sr-only"
        {...props}
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/25 peer-disabled:opacity-45 after:absolute after:top-0.75 after:left-0.75 after:size-4.5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
    </label>
  )
}
