import {
  forwardRef,
  useId,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from './cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  labelAction?: ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { className, label, hint, error, labelAction, id, ...props },
    ref,
  ) {
    const generatedId = useId()
    const textareaId = id ?? generatedId
    const descriptionId = `${textareaId}-description`

    return (
      <div className="grid gap-1.5 text-sm">
        {(label || labelAction) && (
          <span className="flex min-h-6 items-center justify-between gap-2">
            {label && (
              <label className="font-semibold" htmlFor={textareaId}>
                {label}
              </label>
            )}
            {labelAction}
          </span>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'min-h-24 resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
            error &&
              'border-destructive focus:border-destructive focus:ring-destructive/15',
            className,
          )}
          aria-describedby={hint || error ? descriptionId : undefined}
          aria-invalid={Boolean(error)}
          {...props}
        />
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
  },
)
