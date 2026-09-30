# Pages

Pages are route-level composition components. They may coordinate API calls, navigation, metadata, and page-local state, while reusable visual pieces belong in `components/`.

## `LoginPage`

Guest-only sign-in screen wired to Better Auth.

- Uses a two-column card on large screens and a single-column form on smaller screens.
- Applies the reusable four-stop brand gradient to the desktop branding panel.
- Uses the light monochrome signifier on the gradient and theme-appropriate monochrome marks on mobile.
- Provides language and theme controls without requiring a session.
- Supports persistent sessions through the `rememberMe` value.
- Supports SSO discovery by work email through Better Auth's SSO plugin.
- Restores the private URL captured by `PrivateRoute` after successful sign-in.
- Updates the document title and description through translated metadata.

The page should not contain backend-specific authentication details. Keep sign-in transport inside `authClient` and visible messages inside the locale resources.

## Authenticated pages

`AppShell` owns the authenticated navigation, signed-in username, session actions, and the organization switcher. `HomePage` is the landing content, `OrganizationPage` manages organizations, members, and invitations, and `AdminPage` exposes application-wide user administration to users with the Better Auth `admin` role.

- `/organization` is available to authenticated users; Better Auth enforces owner/admin permissions for mutations.
- `/admin` is guarded in the client and every admin endpoint independently enforces permissions on the server.
- Application admin roles and organization member roles are separate concepts.

Future conversation or handover pages should receive their own route-level modules instead of expanding `HomePage` indefinitely.

## Page conventions

- Set localized document title and description in an effect.
- Keep loading, empty, error, and submitting states explicit.
- Use route navigation for page transitions rather than assigning `window.location`.
- Compose primitives from `components/ui`.
- Keep reusable domain components in a dedicated feature folder.
- Do not bypass the route guards with page-local session redirects.
