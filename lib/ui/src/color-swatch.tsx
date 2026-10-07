import { cn } from './cn'

export function ColorSwatch({
  name,
  variable,
  className,
}: {
  name: string
  variable: string
  className: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className={cn('h-16', className)} />
      <div className="bg-card px-3 py-2.5">
        <p className="text-xs font-semibold">{name}</p>
        <code className="mt-0.5 block text-[10px] text-muted-foreground">
          {variable}
        </code>
      </div>
    </div>
  )
}
