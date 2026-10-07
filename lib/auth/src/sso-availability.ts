import { db } from '@mba-desk/db'

type FindVerifiedSsoProvider = () => Promise<{ id: string } | undefined>

export async function hasSsoProviders(
  findProvider: FindVerifiedSsoProvider = () =>
    db.query.ssoProvider.findFirst({
      columns: { id: true },
      where: (provider, { eq }) => eq(provider.domainVerified, true),
    }),
): Promise<boolean> {
  return Boolean(await findProvider())
}
