# `@mba-demo/auth`

Better Auth configuration shared by the Hono application. It uses Drizzle/PostgreSQL for durable auth records and `@mba-demo/kv` as Better Auth secondary storage.

## Configuration

The exported `auth` instance is configured with:

- Application name `MBA Demo Backoffice`.
- Email-and-password authentication enabled.
- SAML/OIDC SSO with verified domains and organization provisioning.
- Application administration with `user` and `admin` roles.
- Organizations, invitations, and members.
- The PostgreSQL Drizzle adapter with schema name `auth`.
- All schema exports from `@mba-demo/db/schema`.
- A KV-backed secondary storage adapter.
- One trusted origin derived from `CORS_ORIGIN`.

The API mounts `auth.handler` at `/api/auth/**`.

## Environment

| Variable             | Development behavior                            | Production behavior        |
| -------------------- | ----------------------------------------------- | -------------------------- |
| `BETTER_AUTH_SECRET` | Falls back to an unsafe development-only secret | Required                   |
| `BETTER_AUTH_URL`    | Defaults to `http://localhost:3000`             | Required                   |
| `CORS_ORIGIN`        | Defaults to `http://localhost:5173`             | Used as the trusted origin |

URLs must use `http://` or `https://`. Generate a high-entropy secret for every deployed environment and never rely on the development fallback in production.

## Storage

Durable auth entities live in PostgreSQL's `auth` schema:

- `user`
- `account`
- `organization`, `member`, and `invitation`
- `team` and `team_member`
- `sso_provider`

Sessions and verification state use Better Auth's secondary-storage bridge rather than duplicate PostgreSQL tables. The bridge supports reads, atomic read-and-delete, TTL-aware writes, deletion, and counters through the common KV interface. It uses Redis when `REDIS_URL` is configured and process-local memory otherwise.

Before the API starts listening, `bootstrapInitialAdmin()` counts the durable users. When the count is zero, it uses Better Auth's server API to create this application administrator:

- Email: `admin@meta.com`
- Name: `Admin`
- Role: `admin`
- Password: a cryptographically random, per-database value printed once at startup

The password and a change-password warning are logged only by the process that creates the account. If another application replica wins the first-start race, the losing replica rechecks the user count and continues without logging invalid credentials.

Better Auth 1.7 does not provide a native force-password-reset-on-next-login flag. The initial administrator can change its password immediately with the password action on the Administration page. Never retain the generated password as a long-term credential.

The API-backed CLI remains available to create an additional administrator explicitly while preserving Better Auth password hashing and hooks:

```bash
yarn auth:create-admin --email admin@example.com --name "Admin" --role admin
```

Application admin roles and organization roles are deliberately independent. An application admin manages users globally; an organization owner/admin manages that organization's membership.

## Updating the auth schema

After changing Better Auth configuration or plugins:

```bash
yarn auth:generate
yarn db:generate
```

The first command regenerates `lib/db/src/schema/auth.ts`. Review the generated TypeScript. The second creates a SQL migration from the schema diff. Commit both the schema and generated migration metadata.

Apply pending migrations with:

```bash
yarn db:migrate
```

Do not hand-maintain duplicate auth tables in another schema.

## Public API

```ts
import { auth, type Auth, type Session } from '@mba-demo/auth'
```

## Verification

```bash
yarn workspace @mba-demo/auth typecheck
yarn workspace @mba-demo/auth test
yarn workspace @mba-demo/auth build
```

Tests cover production environment requirements, initial-admin bootstrap behavior, and the KV secondary-storage bridge without requiring PostgreSQL or Redis.
