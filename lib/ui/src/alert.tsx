import { useState } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from './cn'

type AlertTone = 'primary' | 'success' | 'warning'

const alertTones: Record<AlertTone, string> = {
  primary: 'border-primary/20 bg-primary/7 text-primary',
  success: 'border-success/20 bg-success/7 text-success',
  warning: 'border-warning/25 bg-warning/8 text-warning-foreground',
}

export function Alert({
  icon: Icon,
  title,
  description,
  tone,
  dismissLabel,
}: {
  icon: LucideIcon
  title: string
  description: string
  tone: AlertTone
  dismissLabel: string
}) {
  const [isVisible, setIsVisible] = useState(true)
  if (!isVisible) return null

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4',
        alertTones[tone],
      )}
      role="status"
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <button
        type="button"
        className="ml-auto cursor-pointer opacity-60 hover:opacity-100"
        aria-label={dismissLabel}
        onClick={() => setIsVisible(false)}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
