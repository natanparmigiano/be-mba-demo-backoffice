# Manager routing

The Manager router defines public, guest-only, authenticated, and
admin-restricted route boundaries. Pages rely on these guards rather than
implementing redirects independently.

## Quick start

Register authenticated pages as children of `PrivateRoute` and `AppShell`.
Place application-administration routes below `AdminRoute`.

## Route map

| Route                                                | Screen                     |
| ---------------------------------------------------- | -------------------------- |
| `/login`                                             | Guest sign-in              |
| `/`                                                  | Manager home               |
| `/agents` and `/agents/:id`                          | Agent list and details     |
| `/agents/:id/connectors/:connectorId`                | Agent connector details    |
| `/agents/:id/evals/:evalCaseId`                      | Agent evaluation details   |
| `/channels`, `/channels/new`, `/channels/:channelId` | Channel management         |
| `/webhooks`                                          | Webhook archive            |
| `/functions`                                         | Functions                  |
| `/mcps`                                              | MCP servers                |
| `/api-keys`                                          | API keys                   |
| `/studio`, `/studio/:projectId`                      | Studio                     |
| `/playground`                                        | API Playground             |
| `/organization`                                      | Organization management    |
| `/admin`                                             | Application administration |

Unknown routes redirect to `/`.

## Guard model

`AuthSessionRoute` waits for initial session state, `GuestRoute` excludes
authenticated users, `PrivateRoute` requires a user and organization, and
`AdminRoute` requires the application-admin role. Server authorization remains
authoritative.

## Troubleshooting

Preserve pathname, search, and hash through login redirects. When a route
loops, inspect its nesting before adding redirect logic to the page.

## Verification

Exercise guest, authenticated, missing-organization, non-admin, admin, and
unknown-route states.

## Related documentation

- [Manager pages](../pages/README.md)
- [Manager authentication adapter](../auth/README.md)
