# Workspace pages

Workspace pages orchestrate route data and actions for daily operations.
Reusable presentation belongs in `src/components`.

## Quick start

Add a page under `src/pages`, register its route in `AppRouter`, use the typed
relative API client, and put visible copy in every supported locale.

## Page surface

The application includes Home, Queue, Chat, Teams, Contacts, Groups,
Templates, Sending, Organization management, Administration, and guest
sign-in.

Pages own loading, error, empty, mutation, and navigation state. They should
not duplicate auth guards or common shell behavior.

## Troubleshooting

- A page rendered outside the authenticated shell may be registered at the
  wrong router level.
- A client-side guard never replaces API authorization.
- Shared Organization, Administration, and Login pages come from
  `@mba-desk/web-shared` even though the local page boundary remains stable.

## Verification

Exercise success, loading, empty, error, unauthorized, realtime, and
narrow-layout states for every changed route.

## Related documentation

- [Workspace routing](../router/README.md)
- [Workspace components](../components/README.md)
- [Workspace source map](../README.md)
