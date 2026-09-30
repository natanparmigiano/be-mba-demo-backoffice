export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-bold tracking-[0.13em] text-primary uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.025em]">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
