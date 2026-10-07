import { Check, X } from 'lucide-react'

export interface ToastMessage {
  title: string
  description: string
}

export function Toast({
  message,
  onDismiss,
  dismissLabel,
}: {
  message: ToastMessage | null
  onDismiss: () => void
  dismissLabel: string
}) {
  if (!message) return null

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xl"
      role="status"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success/12 text-success">
        <Check className="size-4 stroke-3" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{message.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {message.description}
        </p>
      </div>
      <button
        type="button"
        className="ml-auto cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label={dismissLabel}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
