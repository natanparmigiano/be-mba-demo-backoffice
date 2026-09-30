import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cn } from './cn'

type MenuContextValue = {
  menuId: string
  open: boolean
  rootRef: React.RefObject<HTMLDivElement | null>
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const MenuContext = createContext<MenuContextValue | null>(null)

function useMenuContext() {
  const context = useContext(MenuContext)

  if (!context) {
    throw new Error('Menu components must be rendered inside Menu.')
  }

  return context
}

function focusMenuItem(
  root: HTMLDivElement | null,
  position: 'first' | 'last',
) {
  requestAnimationFrame(() => {
    const items = root?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    )
    const item = position === 'first' ? items?.[0] : items?.[items.length - 1]
    item?.focus()
  })
}

export function Menu({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <MenuContext.Provider
      value={{ menuId, open, rootRef, setOpen, triggerRef }}
    >
      <div ref={rootRef} className={cn('relative inline-flex', className)}>
        {children}
      </div>
    </MenuContext.Provider>
  )
}

export function MenuTrigger({
  children,
  className,
  onClick,
  onKeyDown,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { menuId, open, rootRef, setOpen, triggerRef } = useMenuContext()

  return (
    <button
      ref={triggerRef}
      type="button"
      className={cn(
        'cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
        className,
      )}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(!open)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
          focusMenuItem(
            rootRef.current,
            event.key === 'ArrowDown' ? 'first' : 'last',
          )
        }
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export function MenuContent({
  align = 'end',
  children,
  className,
  onKeyDown,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) {
  const { menuId, open, setOpen } = useMenuContext()

  if (!open) return null

  return (
    <div
      id={menuId}
      role="menu"
      className={cn(
        'absolute top-full z-50 mt-2 min-w-52 rounded-xl border bg-card p-1.5 text-card-foreground shadow-xl',
        align === 'start' ? 'left-0' : 'right-0',
        className,
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return

        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ),
        )
        const currentIndex = items.indexOf(
          document.activeElement as HTMLButtonElement,
        )
        let nextIndex: number | undefined

        if (event.key === 'ArrowDown')
          nextIndex = (currentIndex + 1) % items.length
        if (event.key === 'ArrowUp') {
          nextIndex = (currentIndex - 1 + items.length) % items.length
        }
        if (event.key === 'Home') nextIndex = 0
        if (event.key === 'End') nextIndex = items.length - 1
        if (event.key === 'Tab') setOpen(false)

        const nextItem = nextIndex === undefined ? undefined : items[nextIndex]
        if (nextItem) {
          event.preventDefault()
          nextItem.focus()
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function MenuItem({
  children,
  className,
  onClick,
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'danger'
}) {
  const { setOpen } = useMenuContext()

  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45',
        variant === 'danger'
          ? 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10'
          : 'text-card-foreground hover:bg-muted focus-visible:bg-muted',
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(false)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export function MenuSeparator({ className }: { className?: string }) {
  return (
    <div role="separator" className={cn('my-1 h-px bg-border', className)} />
  )
}
