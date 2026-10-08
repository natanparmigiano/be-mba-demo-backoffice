# Applications

MBA Desk ships two API applications, two React applications, and an SSO
administration CLI. The Workspace pair serves day-to-day operations; the
Manager pair serves configuration and integration management. Shared behavior
lives in `lib` packages so either application pair can be packaged separately.

## Quick start

From the repository root, install dependencies and start development:

```bash
yarn install
yarn dev
```

The Workspace UI runs at <http://localhost:5173> and the Manager UI at
<http://localhost:5174>. Their Vite proxies forward `/api` to ports `3000` and
`3001`, respectively.

## Application map

| Workspace                 | Responsibility                                                      |
| ------------------------- | ------------------------------------------------------------------- |
| `@mba-desk/api-workspace` | Workspace HTTP API, webhook ingress, and Workspace event processing |
| `@mba-desk/api-manager`   | Manager HTTP API and Runner event processing                        |
| `@mba-desk/web-workspace` | Operational browser application                                     |
| `@mba-desk/web-manager`   | Management browser application                                      |
| `@mba-desk/sso-cli`       | Better Auth SSO provider administration over HTTP                   |

Each HTTP application composes neutral routes from `@mba-desk/api-core` with
its product-specific core package. Each browser application uses
`@mba-desk/web-shared` for authentication, organization management, the shell,
and other common UI.

## Everyday workflows

Use Yarn workspace commands when working on one application:

```bash
yarn workspace @mba-desk/api-workspace dev
yarn workspace @mba-desk/web-workspace dev
yarn workspace @mba-desk/api-manager dev
yarn workspace @mba-desk/web-manager dev
```

Production entrypoint roles are `workspace-app`, `manager-app`,
`workspace-worker`, `manager-worker`, and `migrate`.

## Troubleshooting

- A browser application with API failures usually means its matching API is
  not running or the expected port is occupied.
- Memory events do not cross processes. Run each application's subscriber in
  its application process when using the memory adapter.
- Run migrations explicitly before starting production application roles.

## Verification

Run `yarn quality` for the complete repository gate, or use the package-level
commands in each application guide.

## Related documentation

- [Workspace API](api-workspace/README.md)
- [Manager API](api-manager/README.md)
- [Workspace frontend](web-workspace/README.md)
- [Manager frontend](web-manager/README.md)
- [SSO CLI](sso-cli/README.md)
- [Deployment](../deployment/README.md)
