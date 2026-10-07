# Manager routing

`/login` is guest-only. `/` is the management dashboard. Authenticated routes
also cover `/agents` and its detail
routes, `/channels` and its form routes, `/webhooks`, `/functions`, `/mcps`,
`/api-keys`, `/studio`, `/studio/:projectId`, `/playground`, `/organization`,
and admin-guarded `/admin`. Unknown routes redirect to `/`.

`AuthSessionRoute`, `GuestRoute`, and `PrivateRoute` own session boundaries;
pages must not duplicate their redirects.
