import { Check } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: string
  description?: string
}

export function Checkbox({
  className,
  label,
  description,
  id,
  ...props
}: CheckboxProps) {
  const generatedId = useId()
  const checkboxId = id ?? generatedId

  return (
    <label
      className={cn(
        'group flex w-fit cursor-pointer items-start gap-3 text-sm',
        className,
      )}
      htmlFor={checkboxId}
    >
      <input
        id={checkboxId}
        type="checkbox"
        className="peer sr-only"
        {...props}
      />
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-input bg-card text-transparent transition group-hover:border-primary peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/25 peer-disabled:opacity-45">
        <Check className="size-3.5 stroke-3" aria-hidden />
      </span>
      <span className="grid gap-0.5">
        <span className="font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}
