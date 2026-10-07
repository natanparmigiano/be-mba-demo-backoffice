# `@mba-desk/api-workspace`

The Workspace HTTP application serves the operational frontend. Its API surface
contains chats and queue operations, contacts, groups, teams, templates,
template sending, stickers, and read-only channel summaries/dashboard metrics.
It also mounts the common authentication, organization, administration, logo,
file, and health routes from `@mba-desk/api-core`.

It listens on `WORKSPACE_API_PORT` (default `3000`), trusts
`WORKSPACE_CORS_ORIGIN` (falling back to `CORS_ORIGIN`), and serves
`WORKSPACE_WEB_ROOT` (default `../web-workspace/dist`) when built.

```bash
yarn workspace @mba-desk/api-workspace dev
yarn workspace @mba-desk/api-workspace typecheck
yarn workspace @mba-desk/api-workspace test
yarn workspace @mba-desk/api-workspace build
```
