import { Search } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export function SearchBox({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        className="h-10 w-full rounded-full border border-transparent bg-muted pr-4 pl-10 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/15"
        {...props}
      />
    </div>
  )
}
