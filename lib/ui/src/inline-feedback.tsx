import type { HTMLAttributes } from 'react'
import { cn } from './cn'

type InlineFeedbackTone = 'error' | 'success' | 'warning'

const toneClasses: Record<InlineFeedbackTone, string> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning-foreground',
}

export function InlineFeedback({
  tone,
  role = tone === 'error' ? 'alert' : 'status',
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone: InlineFeedbackTone
}) {
  return (
    <p
      className={cn(
        'rounded-xl border p-3 text-sm',
        toneClasses[tone],
        className,
      )}
      role={role}
      {...props}
    />
  )
}
