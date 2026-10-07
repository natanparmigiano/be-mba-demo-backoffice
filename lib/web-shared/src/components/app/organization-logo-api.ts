export async function uploadOrganizationLogo(
  organizationId: string,
  logo: Blob,
) {
  const response = await fetch(
    `/api/organization-logos/${encodeURIComponent(organizationId)}`,
    { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: logo },
  )
  if (!response.ok) throw new Error('Logo upload failed')
}

export async function removeOrganizationLogo(organizationId: string) {
  const response = await fetch(
    `/api/organization-logos/${encodeURIComponent(organizationId)}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error('Logo removal failed')
}
