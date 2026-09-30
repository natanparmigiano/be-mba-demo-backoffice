# Authentication

This folder contains the frontend boundary for Better Auth. It exposes a configured client and a small React context used by route guards and authenticated pages.

## Files

- `auth-client.ts`: creates the Better Auth React client with SSO, admin, organization, and team plugins against `window.location.origin`.
- `AuthProvider.tsx`: adapts `authClient.useSession()` into application-friendly context.

## Client behavior

The auth client uses the current browser origin. Better Auth requests therefore travel through the same `/api` origin as the application; Vite proxies those requests to the backend during local development.

```ts
import { authClient } from './auth-client'

await authClient.signIn.email({ email, password, rememberMe })
await authClient.signIn.sso({ email, callbackURL: '/' })
await authClient.signOut()
```

Do not duplicate auth response interfaces. `AuthSession` and `AuthUser` are inferred directly from the configured Better Auth client.

## Session context

`AuthProvider` exposes:

| Value          | Meaning                                                           |
| -------------- | ----------------------------------------------------------------- |
| `session`      | Current Better Auth session, or `null`.                           |
| `user`         | Convenience reference to `session.user`, or `null`.               |
| `isPending`    | Initial session request is unresolved. Guards must wait for this. |
| `isRefetching` | A later session refresh is in progress.                           |
| `error`        | Session-fetch error from Better Auth.                             |
| `refetch()`    | Refreshes session data after sign-in or sign-out.                 |

Use `useAuth()` only below `AuthProvider`; it intentionally throws outside that boundary. `AppRouter` installs the provider around guest and private routes but not around public routes.

## Authentication flow

Sign-in on `LoginPage`:

1. Submits email, password, and `rememberMe` to `authClient.signIn.email`.
2. Displays a localized generic credential error when authentication fails.
3. Refetches session state after success.
4. Redirects to the originally requested private location, or `/`.

Sign-out in the authenticated `AppShell`:

1. Calls `authClient.signOut()`.
2. Refetches the session.
3. Replaces browser history with `/login`.

## Security conventions

- Never store passwords, session tokens, or raw auth responses in application local storage.
- Let Better Auth manage session transport and cookies.
- Keep redirect destinations internal; `LoginPage` accepts only a pathname beginning with `/`.
- Keep auth error messages user-safe and localized rather than exposing backend internals.
- Put session-dependent UI below `AuthSessionRoute`.
- Keep `/admin` behind `AdminRoute`; server-side Better Auth permission checks remain authoritative.
