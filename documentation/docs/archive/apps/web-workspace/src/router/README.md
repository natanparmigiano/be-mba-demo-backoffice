# Workspace routing

The Workspace router defines public, guest-only, authenticated, and
admin-restricted route boundaries. Pages rely on these guards rather than
implementing redirects independently.

## Quick start

Register authenticated pages as children of `PrivateRoute` and `AppShell`.
Place application-administration routes below `AdminRoute`.

## Route map

| Route                                                               | Screen                     |
| ------------------------------------------------------------------- | -------------------------- |
| `/login`                                                            | Guest sign-in              |
| `/`                                                                 | Workspace home             |
| `/queue`                                                            | Queue                      |
| `/chat`, `/chat/:chatId`                                            | Conversations              |
| `/teams`                                                            | Teams                      |
| `/contacts`                                                         | Contacts                   |
| `/groups`                                                           | Groups                     |
| `/templates`, `/templates/new`, `/templates/:channelId/:templateId` | Templates                  |
| `/template-sending`                                                 | Sending                    |
| `/organization`                                                     | Organization management    |
| `/admin`                                                            | Application administration |

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

Exercise guest, invitation-only, authenticated, missing-organization,
non-admin, admin, and unknown-route states.

## Related documentation

- [Workspace pages](../pages/README.md)
- [Workspace authentication adapter](../auth/README.md)
