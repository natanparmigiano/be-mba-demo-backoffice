# Workspace routing

`/login` is guest-only. Authenticated routes are `/`, `/queue`, `/chat`,
`/chat/:chatId`, `/teams`, `/contacts`, `/groups`, `/templates`,
`/templates/new`, `/templates/:channelId/:templateId`, `/template-sending`,
`/organization`, and admin-guarded `/admin`. Unknown routes redirect to `/`.

`AuthSessionRoute`, `GuestRoute`, and `PrivateRoute` own session boundaries;
pages must not duplicate their redirects.
