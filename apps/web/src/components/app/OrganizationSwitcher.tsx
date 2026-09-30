import { Building2, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { authClient } from '../../auth/auth-client'
import { useAuth } from '../../auth/AuthProvider'

export function OrganizationSwitcher() {
  const { refetch: refetchSession } = useAuth()
  const organizationsQuery = authClient.useListOrganizations()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const organizations = organizationsQuery.data ?? []
  const activeOrganization = activeOrganizationQuery.data
  const [isChanging, setIsChanging] = useState(false)

  const setOrganization = async (organizationId: string) => {
    setIsChanging(true)
    try {
      const result = await authClient.organization.setActive({ organizationId })
      if (result.error) throw new Error(result.error.message)
      await Promise.all([activeOrganizationQuery.refetch(), refetchSession()])
    } finally {
      setIsChanging(false)
    }
  }

  if (organizationsQuery.isPending) {
    return <div className="m-1 h-14 animate-pulse rounded-xl bg-muted" />
  }

  if (organizations.length === 0) {
    return (
      <div className="grid gap-1.5 p-1 text-[11px] font-semibold text-muted-foreground">
        <span className="px-2">Organization</span>
        <div className="flex h-10 items-center gap-2 rounded-xl bg-muted/70 px-3 text-xs">
          <Building2 className="size-4" />
          No organization
        </div>
      </div>
    )
  }

  return (
    <div className="p-1">
      <label className="grid gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <span className="px-2">Organization</span>
        <span className="relative">
          <Building2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <select
            className="h-10 w-full appearance-none rounded-xl border border-transparent bg-muted/70 pr-8 pl-8 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus:border-ring focus:ring-3 focus:ring-ring/15"
            value={activeOrganization?.id ?? ''}
            disabled={isChanging}
            onChange={(event) => void setOrganization(event.target.value)}
          >
            <option value="" disabled>
              Select organization
            </option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
        </span>
      </label>
    </div>
  )
}
