# `@mba-desk/api-core`

Neutral HTTP infrastructure shared by both MBA Desk applications. It owns
common lifecycle and organization capabilities without importing either
application-specific core.

At a glance: use this package for server startup, common authentication and
organization routes, application URLs, health checks, signed files, and SPA
fallbacks.

## Quick start

Compose its route factories in the owning API and call `startApiServer`.
Inject that application's subscriber registrar only when its worker runs in
process.

This package contains the common Better Auth mount, health and application URL
routes, user and organization administration, organization invitations and
logos, signed file delivery, static SPA fallback, and process lifecycle.

Feature routes and event subscribers intentionally do not live here:

- `@mba-desk/api-workspace-core` owns operational routes, WhatsApp webhook
  ingress support, and the Workspace worker.
- `@mba-desk/api-manager-core` owns management/playground routes, MCP and
  Runner support, and the Manager worker.

## Troubleshooting

Startup rejects an enabled in-process worker without a subscriber registrar.
Use `WORKSPACE_URL` and `MANAGER_URL` for cross-application callbacks instead
of inferring another application's URL from the request host.

## Verification

```bash
yarn workspace @mba-desk/api-core typecheck
yarn workspace @mba-desk/api-core test
yarn workspace @mba-desk/api-core build
```

## Related documentation

- [Workspace API core](../api-workspace-core/README.md)
- [Manager API core](../api-manager-core/README.md)
- [Events](../events/README.md)
