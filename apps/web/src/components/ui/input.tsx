import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  labelAction?: ReactNode
  leadingIcon?: LucideIcon
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    label,
    hint,
    error,
    labelAction,
    leadingIcon: LeadingIcon,
    id,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const descriptionId = `${inputId}-description`

  return (
    <div className="grid gap-1.5 text-sm">
      {(label || labelAction) && (
        <span className="flex min-h-6 items-center justify-between gap-2">
          {label && (
            <label className="font-semibold" htmlFor={inputId}>
              {label}
            </label>
          )}
          {labelAction}
        </span>
      )}
      <span className="relative block">
        {LeadingIcon && (
          <LeadingIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground/75 focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
            LeadingIcon && 'pl-10',
            error &&
              'border-destructive focus:border-destructive focus:ring-destructive/15',
            className,
          )}
          aria-describedby={hint || error ? descriptionId : undefined}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </span>
      {(label || hint || error) && (
        <span
          id={hint || error ? descriptionId : undefined}
          className={cn(
            'min-h-4 text-xs leading-4 text-muted-foreground',
            error && 'text-destructive',
          )}
          aria-hidden={hint || error ? undefined : true}
        >
          {error ?? hint ?? '\u00a0'}
        </span>
      )}
    </div>
  )
})
