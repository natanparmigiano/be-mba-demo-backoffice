import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from './cn'

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  label: string
  indicatorClassName?: string
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  function Progress(
    { value, max = 100, label, className, indicatorClassName, ...props },
    ref,
  ) {
    const safeMax = Number.isFinite(max) && max > 0 ? max : 100
    const safeValue = Number.isFinite(value)
      ? Math.min(safeMax, Math.max(0, value))
      : 0
    const percentage = (safeValue / safeMax) * 100

    return (
      <div
        ref={ref}
        {...props}
        aria-label={label}
        aria-valuemax={safeMax}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}
        role="progressbar"
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] duration-300',
            indicatorClassName,
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    )
  },
)
