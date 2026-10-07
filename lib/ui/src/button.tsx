import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80',
  secondary:
    'border-transparent bg-primary/12 text-primary hover:bg-primary/18 active:bg-primary/24',
  outline:
    'border-border bg-card text-card-foreground shadow-sm hover:bg-muted/70',
  ghost:
    'border-transparent bg-transparent text-foreground hover:bg-muted/70 active:bg-muted',
  success:
    'border-transparent bg-success text-success-foreground shadow-sm hover:bg-success/90 active:bg-success/80',
  danger:
    'border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'h-10 rounded-lg px-4 text-sm',
  lg: 'h-12 rounded-xl px-5 text-sm',
  icon: 'size-10 rounded-full p-0',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center gap-2 border font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-45',
          buttonVariants[variant],
          buttonSizes[size],
          className,
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        )}
        {(!isLoading || size !== 'icon') && children}
      </button>
    )
  },
)
