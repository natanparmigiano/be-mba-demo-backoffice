import type { LucideIcon } from 'lucide-react'

export function StatCard({
  icon: Icon,
  label,
  value,
  change,
}: {
  icon: LucideIcon
  label: string
  value: string
  change: string
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <div className="flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-lg bg-card text-primary shadow-xs">
          <Icon className="size-4" />
        </span>
        <span className="text-[11px] font-semibold text-success">{change}</span>
      </div>
      <p className="mt-4 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
