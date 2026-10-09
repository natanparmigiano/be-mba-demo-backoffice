# Manager API

`@mba-desk/api-manager` is the HTTP entrypoint for the management product. It
serves Agents, Channels, Webhooks, Functions, MCPs, API Keys, Studio, and API
Playground, plus common authentication and organization surfaces.

## Quick start

```bash
yarn workspace @mba-desk/api-manager dev
```

The development server listens on <http://localhost:3001>. Pair it with the
Manager frontend at <http://localhost:44101>.

## Boundaries and composition

The application combines:

- management routes and the Runner subscriber from
  `@mba-desk/api-manager-core`;
- authentication, organization administration, invitations, files, logos,
  and health routes from `@mba-desk/api-core`;
- process startup, graceful shutdown, and optional in-process subscribers.

WhatsApp webhook ingress and operational chat processing belong to the
Workspace API.

## Configuration

| Variable              | Default                  | Purpose                        |
| --------------------- | ------------------------ | ------------------------------ |
| `MANAGER_API_PORT`    | `3001`                   | HTTP listening port            |
| `MANAGER_CORS_ORIGIN` | `http://localhost:44101` | Allowed Manager browser origin |
| `MANAGER_WEB_ROOT`    | `../web-manager/dist`    | Compiled Manager SPA directory |

The development script also sets Better Auth's public URL and CORS origin to
the proxied Manager browser origin.

## Worker model

Memory-event deployments register the Manager subscriber in the API process.
Kafka deployments run the same registry through the `manager-worker` role. Do
not point this worker at Workspace topics.

## Troubleshooting

- A Manager browser request reaching port `3000` is misconfigured; its Vite
  proxy and API use port `3001`.
- A management route returning `404` from the Workspace host is expected; use
  the Manager host.
- If Runner jobs remain queued, verify that the Manager subscriber is running.

## Verification

```bash
yarn workspace @mba-desk/api-manager typecheck
yarn workspace @mba-desk/api-manager test
yarn workspace @mba-desk/api-manager build
```

## Related documentation

- [Manager frontend](../web-manager/README.md)
- [Application overview](../README.md)
- [Deployment](../../deployment/README.md)
