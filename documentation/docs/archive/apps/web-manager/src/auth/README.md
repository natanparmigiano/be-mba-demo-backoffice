# Manager authentication adapter

The Manager `src/auth` files preserve a local import boundary while
re-exporting the Better Auth client, session types, provider, and hook from
`@mba-desk/web-shared`. The shared package owns the implementation.

## Quick start

Pages import the local adapter:

```ts
import { authClient } from '../auth/auth-client'
```

Use `useAuth()` only below the shared `AuthProvider` installed by the router.

## Boundaries and security

Better Auth owns cookies and session transport. Never store passwords,
session tokens, or raw auth responses in browser storage. Keep redirect
destinations internal, wait for initial session loading in guards, and retain
server-side authorization for protected operations.

Public routes must remain outside session-dependent routing. The `/admin`
screen requires the explicit admin guard in addition to backend permission
checks.

## Troubleshooting

- An error that occurs in both frontends probably belongs in
  `@mba-desk/web-shared`, not in this adapter.
- Authentication calls use the current browser origin and the Manager `/api`
  proxy to port `3001` during development.
- Calling `useAuth()` outside its provider intentionally throws.

## Verification

Exercise login, logout, redirect preservation, organization selection, and
admin denial and success states.

## Related documentation

- [Manager routing](../router/README.md)
- [Manager frontend](../../README.md)
