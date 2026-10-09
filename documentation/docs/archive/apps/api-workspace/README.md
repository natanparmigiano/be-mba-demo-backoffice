# Workspace API

`@mba-desk/api-workspace` is the HTTP entrypoint for day-to-day operations. It
serves chats and queue operations, contacts, groups, teams, templates,
template sending, stickers, channel summaries, and WhatsApp webhook ingress.

## Quick start

```bash
yarn workspace @mba-desk/api-workspace dev
```

The development server listens on <http://localhost:3000>. Pair it with the
Workspace frontend at <http://localhost:44100>.

## Boundaries and composition

The application combines:

- operational routes, webhook ingestion, and WhatsApp subscribers from
  `@mba-desk/api-workspace-core`;
- authentication, organization administration, invitations, files, logos,
  and health routes from `@mba-desk/api-core`;
- process startup, graceful shutdown, and optional in-process subscribers.

Agent, channel configuration, MCP, Function, Studio, and Playground routes
belong to the Manager API.

## Configuration

| Variable                | Default                 | Purpose                          |
| ----------------------- | ----------------------- | -------------------------------- |
| `WORKSPACE_API_PORT`    | `3000`                  | HTTP listening port              |
| `WORKSPACE_CORS_ORIGIN` | `CORS_ORIGIN`           | Allowed Workspace browser origin |
| `WORKSPACE_WEB_ROOT`    | `../web-workspace/dist` | Compiled Workspace SPA directory |

The development script sets Better Auth's public URL and CORS origin to the
proxied Workspace browser origin.

## Worker model

Memory-event deployments register the Workspace subscriber in the API
process, keeping webhook publication and consumption together. Kafka
deployments use the standalone `workspace-worker` role.

## Troubleshooting

- Provider callback URLs must use the Workspace public URL, not the Manager
  host.
- A Workspace browser request reaching port `3001` is misconfigured; its Vite
  proxy and API use port `3000`.
- If realtime updates stop in a memory deployment, confirm the Workspace
  in-process subscriber is enabled.

## Verification

```bash
yarn workspace @mba-desk/api-workspace typecheck
yarn workspace @mba-desk/api-workspace test
yarn workspace @mba-desk/api-workspace build
```

## Related documentation

- [Workspace frontend](../web-workspace/README.md)
- [Application overview](../README.md)
- [Deployment](../../deployment/README.md)
