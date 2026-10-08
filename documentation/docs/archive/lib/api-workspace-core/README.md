# `@mba-desk/api-workspace-core`

Workspace-only API route factories and event processing. It owns chats,
contacts, groups, teams, templates, stickers, channel overview, WhatsApp
webhook ingress support, webhook persistence/forwarding, and realtime chat
publication.

The package must not depend on `@mba-desk/api-manager-core`.

Its worker entrypoint is `workspace-worker`.

At a glance: this package remains in a Workspace-only public release and must
never import `@mba-desk/api-manager-core`.

## Quick start

Compose its routes in the Workspace API and register its subscribers when the
worker runs in process.

## Boundaries and troubleshooting

In Kafka mode run `workspace-worker`; in memory mode keep webhook subscribers
in the Workspace API process because memory events cannot cross processes.
Unknown Manager topics are rejected at startup.

## Verification

```bash
yarn workspace @mba-desk/api-workspace-core typecheck
yarn workspace @mba-desk/api-workspace-core test
yarn workspace @mba-desk/api-workspace-core build
```

## Related documentation

- [Neutral API core](../api-core/README.md)
- [Events](../events/README.md)
- [WhatsApp packages](../whatsapp/README.md)
