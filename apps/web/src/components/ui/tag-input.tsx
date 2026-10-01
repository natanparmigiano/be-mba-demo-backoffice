import { X } from 'lucide-react'
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react'
import { cn } from './cn'

export interface TagInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  value: string[]
  onValueChange: (value: string[]) => void
  getRemoveLabel: (tag: string) => string
  label?: string
  hint?: string
  error?: string
}

export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(
  function TagInput(
    {
      value,
      onValueChange,
      getRemoveLabel,
      label,
      hint,
      error,
      id,
      className,
      disabled,
      placeholder,
      ...props
    },
    ref,
  ) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const descriptionId = `${inputId}-description`
    const [draft, setDraft] = useState('')

    const addTags = (raw: string) => {
      const additions = raw
        .split(/[,\n]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag && !value.includes(tag))
      if (additions.length > 0) onValueChange([...value, ...additions])
      setDraft('')
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault()
        addTags(draft)
      } else if (event.key === 'Backspace' && !draft && value.length > 0) {
        onValueChange(value.slice(0, -1))
      }
    }

    return (
      <div className="grid gap-1.5 text-sm">
        {label && (
          <label className="font-semibold" htmlFor={inputId}>
            {label}
          </label>
        )}
        <div
          className={cn(
            'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 shadow-xs transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15',
            disabled && 'cursor-not-allowed bg-muted opacity-70',
            error &&
              'border-destructive focus-within:border-destructive focus-within:ring-destructive/15',
            className,
          )}
        >
          {value.map((tag) => (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
              key={tag}
            >
              <span className="truncate">{tag}</span>
              <button
                aria-label={getRemoveLabel(tag)}
                className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-sm hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none"
                disabled={disabled}
                type="button"
                onClick={() =>
                  onValueChange(value.filter((item) => item !== tag))
                }
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            {...props}
            ref={ref}
            id={inputId}
            aria-describedby={hint || error ? descriptionId : undefined}
            aria-invalid={Boolean(error)}
            className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/75 disabled:cursor-not-allowed"
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : undefined}
            value={draft}
            onBlur={() => draft.trim() && addTags(draft)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text')
              if (/[,\n]/.test(pasted)) {
                event.preventDefault()
                addTags(pasted)
              }
            }}
          />
        </div>
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
