interface ActivityPoint {
  date: string
  inbound: number
  outbound: number
}

interface DistributionPoint {
  type: string
  count: number
}

export function ActivityChart({
  data,
  inboundLabel,
  outboundLabel,
  label,
}: {
  data: ActivityPoint[]
  inboundLabel: string
  outboundLabel: string
  label: string
}) {
  const maximum = Math.max(
    1,
    ...data.flatMap((point) => [point.inbound, point.outbound]),
  )
  return (
    <div>
      <div className="mb-4 flex gap-4 text-xs text-muted-foreground">
        <Legend color="bg-primary" label={inboundLabel} />
        <Legend color="bg-success" label={outboundLabel} />
      </div>
      <div className="flex h-44 items-end gap-2" role="img" aria-label={label}>
        {data.map((point) => (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            key={point.date}
          >
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <Bar
                value={point.inbound}
                maximum={maximum}
                className="bg-primary"
              />
              <Bar
                value={point.outbound}
                maximum={maximum}
                className="bg-success"
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {point.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DistributionChart({
  data,
  label,
  emptyLabel,
}: {
  data: DistributionPoint[]
  label: string
  emptyLabel: string
}) {
  const visible = data.slice(0, 6)
  const maximum = Math.max(1, ...visible.map((point) => point.count))
  if (visible.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }
  return (
    <div className="grid gap-3" role="img" aria-label={label}>
      {visible.map((point) => (
        <div
          className="grid grid-cols-[6rem_1fr_auto] items-center gap-3"
          key={point.type}
        >
          <span className="truncate text-xs font-semibold capitalize">
            {point.type}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{
                width: `${Math.max(3, (point.count / maximum) * 100)}%`,
              }}
            />
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {point.count}
          </span>
        </div>
      ))}
    </div>
  )
}

function Bar({
  value,
  maximum,
  className,
}: {
  value: number
  maximum: number
  className: string
}) {
  return (
    <span
      className={`w-full max-w-5 rounded-t-sm ${className}`}
      style={{
        height: `${Math.max(value > 0 ? 3 : 0, (value / maximum) * 100)}%`,
      }}
      title={String(value)}
    />
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  )
}
