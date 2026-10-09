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

The common channel dashboard route combines provider analytics with
organization- and channel-scoped local database aggregates. Local aggregates
cover contacts, groups, conversations, handoffs, the human queue, unread and
directional messages, delivery outcomes, daily activity, and message types.
The response also aggregates `stats.events` into agent/human message rates,
average first-human-response duration, and team/user assignment rankings.
The combined JSON response is cached in `@mba-desk/kv` for 300 seconds using a
key scoped by organization, channel, and requested period. Cache failures fall
back to a fresh response rather than failing the dashboard request.
The optional `refresh=true` query bypasses the current snapshot and replaces
it, which is what the Home dashboard's Refresh action uses.

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
