import { ChevronDown } from 'lucide-react'
import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { cn } from './cn'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  labelAction?: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { className, label, hint, labelAction, id, children, ...props },
    ref,
  ) {
    const generatedId = useId()
    const selectId = id ?? generatedId
    const descriptionId = `${selectId}-description`

    return (
      <div className="grid gap-1.5 text-sm">
        {(label || labelAction) && (
          <span className="flex min-h-6 items-center justify-between gap-2">
            {label && (
              <label className="font-semibold" htmlFor={selectId}>
                {label}
              </label>
            )}
            {labelAction}
          </span>
        )}
        <span className="relative block">
          <select
            ref={ref}
            id={selectId}
            aria-describedby={hint ? descriptionId : undefined}
            className={cn(
              'h-10 w-full appearance-none rounded-lg border border-input bg-card px-3.5 pr-10 text-sm text-foreground shadow-xs outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </span>
        {(label || hint) && (
          <span
            id={hint ? descriptionId : undefined}
            className="min-h-4 text-xs leading-4 text-muted-foreground"
            aria-hidden={hint ? undefined : true}
          >
            {hint ?? '\u00a0'}
          </span>
        )}
      </div>
    )
  },
)
