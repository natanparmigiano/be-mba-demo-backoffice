import signifierUrl from '../../assets/signifier.png'
import { cn } from '@mba-desk/ui'

function organizationLogoUrl(
  organization: { id: string; logo?: string | null } | null | undefined,
) {
  if (!organization?.logo) return signifierUrl
  return `/api/organization-logos/${encodeURIComponent(organization.id)}?v=${encodeURIComponent(organization.logo)}`
}

export function OrganizationLogo({
  organization,
  className,
  alt = '',
}: {
  organization: { id: string; logo?: string | null } | null | undefined
  className?: string
  alt?: string
}) {
  return (
    <img
      className={cn('shrink-0 rounded-xl object-cover', className)}
      src={organizationLogoUrl(organization)}
      alt={alt}
    />
  )
}
