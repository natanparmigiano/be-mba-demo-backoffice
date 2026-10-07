# `@mba-desk/api-manager`

The Manager HTTP application serves administration of channels, agents,
webhooks, functions, MCPs, API keys, Studio, and API Playground. It owns the
WA Cloud webhook publisher and the optional in-process event worker. It also
mounts the common authentication, organization, administration, logo, file,
and health routes from `@mba-desk/api-core`.

It listens on `MANAGER_API_PORT` (default `3001`), trusts
`MANAGER_CORS_ORIGIN` (default `http://localhost:5174`), and serves
`MANAGER_WEB_ROOT` (default `../web-manager/dist`) when built.

```bash
yarn workspace @mba-desk/api-manager dev
yarn workspace @mba-desk/api-manager typecheck
yarn workspace @mba-desk/api-manager test
yarn workspace @mba-desk/api-manager build
```
