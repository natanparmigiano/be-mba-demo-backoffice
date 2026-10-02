import { ChevronDown, Play } from 'lucide-react'
import { useState, type ReactNode, type SubmitEvent } from 'react'
import { Button } from '../ui'
import {
  PlaygroundRequestActions,
  type PlaygroundRequestExample,
} from './PlaygroundRequestActions'
import {
  usePlaygroundPostmanVariableReplacements,
  useRegisterPlaygroundPostmanEntry,
} from './PlaygroundPostmanRegistry'

export type { PlaygroundRequestExample } from './PlaygroundRequestActions'

export type PlaygroundOperationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: unknown }
  | { status: 'error'; message: string }

export function PlaygroundOperationCard({
  method,
  title,
  description,
  action,
  state,
  disabled,
  buttonVariant = 'primary',
  onSubmit,
  resultLabel,
  request,
  defaultOpen = false,
  children,
}: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  title: string
  description: string
  action: string
  state: PlaygroundOperationState
  disabled: boolean
  buttonVariant?: 'primary' | 'danger'
  onSubmit: () => void
  resultLabel: string
  request: PlaygroundRequestExample
  defaultOpen?: boolean
  children?: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const variableReplacements = usePlaygroundPostmanVariableReplacements()
  useRegisterPlaygroundPostmanEntry({
    title,
    request,
    defaultMethod: method,
  })
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <details
      className="group overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition-colors marker:hidden hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/25 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span
          className={
            method === 'GET'
              ? 'rounded-md bg-success/12 px-2 py-1 font-mono text-[11px] font-bold text-success'
              : method === 'DELETE'
                ? 'rounded-md bg-destructive/12 px-2 py-1 font-mono text-[11px] font-bold text-destructive'
                : 'rounded-md bg-primary/12 px-2 py-1 font-mono text-[11px] font-bold text-primary'
          }
        >
          {method}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold tracking-[-0.01em]">
            {title}
          </span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">
            {description}
          </span>
        </span>
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t p-5 sm:p-6">
        <form className="grid gap-4" onSubmit={submit}>
          {children}
          <Button
            className="justify-self-start"
            type="submit"
            variant={buttonVariant}
            disabled={disabled}
            isLoading={state.status === 'loading'}
          >
            <Play className="size-4" aria-hidden />
            {action}
          </Button>
          <PlaygroundRequestActions
            request={request}
            defaultMethod={method}
            title={title}
            variableReplacements={variableReplacements}
          />
        </form>
        <div className="mt-4" aria-live="polite">
          {state.status === 'success' && (
            <div>
              <p className="mb-2 text-xs font-bold text-success">
                {resultLabel}
              </p>
              <pre className="max-h-64 overflow-auto rounded-xl border bg-muted/45 p-3 font-mono text-xs leading-5">
                {JSON.stringify(state.result, null, 2)}
              </pre>
            </div>
          )}
          {state.status === 'error' && (
            <p
              className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {state.message}
            </p>
          )}
        </div>
      </div>
    </details>
  )
}
