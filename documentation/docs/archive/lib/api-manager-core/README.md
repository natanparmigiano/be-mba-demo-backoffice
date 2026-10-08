# `@mba-desk/api-manager-core`

Manager-only API route factories and event processing. It owns channel and
agent management, playgrounds, Studio, MCP, Runner, API keys, webhook archives,
and queued Runner execution.

Its worker entrypoint is `manager-worker`.

At a glance: this package is intentionally removable from a Workspace-only
release. Neither Workspace API package may import it.

## Quick start

Compose its routes in the Manager API and register its subscribers when the
worker runs in process.

## Boundaries and troubleshooting

WhatsApp webhook ingress and operational chat routes belong to Workspace. In
Kafka mode run `manager-worker`; in memory mode keep its subscribers in the
Manager API process. Unknown Workspace topics are rejected at startup.

## Verification

```bash
yarn workspace @mba-desk/api-manager-core typecheck
yarn workspace @mba-desk/api-manager-core test
yarn workspace @mba-desk/api-manager-core build
```

## Related documentation

- [Neutral API core](../api-core/README.md)
- [Runner](../runner/README.md)
- [Events](../events/README.md)
