# Manager pages

Manager pages orchestrate route data and actions for configuration and
integration management. Reusable presentation belongs in `src/components`.

## Quick start

Add a page under `src/pages`, register its route in `AppRouter`, use the typed
relative API client, and put visible copy in every supported locale.

## Page surface

The application includes Home, Agents and agent details, Channels, Webhooks,
Functions, MCPs, API Keys, Studio, API Playground, Organization management,
Administration, and guest sign-in.

Pages own loading, error, empty, mutation, and navigation state. They should
not duplicate auth guards or common shell behavior.

## Troubleshooting

- A page rendered outside the authenticated shell may be registered at the
  wrong router level.
- A client-side guard never replaces API authorization.
- Shared Organization, Administration, and Login pages come from
  `@mba-desk/web-shared` even though the local page boundary remains stable.

## Verification

Exercise success, loading, empty, error, unauthorized, and narrow-layout
states for every changed route.

## Related documentation

- [Manager routing](../router/README.md)
- [Manager components](../components/README.md)
- [Manager source map](../README.md)
