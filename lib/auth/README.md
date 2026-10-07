# `@mba-desk/auth`

This package is the server's single Better Auth configuration boundary. It
stores durable identities and organizations in PostgreSQL, places sessions and
verification state in the selected `@mba-desk/kv` adapter, and exposes the
handler mounted by Hono at `/api/auth/*`.

Production must provide `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.
Multi-instance deployments must also configure PostgreSQL or Redis secondary
storage; process memory cannot coordinate sessions or verification state.

## Configuration

The exported `auth` instance is configured with:

- Application name `MBA Desk`.
- Email-and-password authentication enabled.
- SAML/OIDC SSO with verified domains and organization provisioning.
- Application administration with `user` and `admin` roles.
- Organizations, invitations, and members.
- Teams with required unique slugs, validated colors, a single organization
  default, and user membership. Creating an organization immediately creates
  its `Default Team` and adds the creator through Better Auth's default-team
  flow.
- An optional validated organization `primaryColor`; new organizations default
  to the application's `#0866ff` primary color.
- An optional organization `logo` containing the relative key of its image in
  the configured file store; the API owns upload, access, and deletion.
- The PostgreSQL Drizzle adapter with schema name `auth`.
- All schema exports from `@mba-desk/db/schema`.
- A KV-backed secondary storage adapter.
- One trusted origin derived from `CORS_ORIGIN`.

The API mounts the resulting `auth.handler` at `/api/auth/*`.

## Environment

| Variable                      | Development behavior                            | Production behavior                     |
| ----------------------------- | ----------------------------------------------- | --------------------------------------- |
| `BETTER_AUTH_SECRET`          | Falls back to an unsafe development-only secret | Required                                |
| `BETTER_AUTH_URL`             | Defaults to `http://localhost:3000`             | Required                                |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Optional comma-separated IdP origins            | Required for every OIDC endpoint origin |
| `CORS_ORIGIN`                 | Defaults to `http://localhost:5173`             | Used as the trusted browser origin      |

URLs must use `http://` or `https://`. Generate a high-entropy secret for every deployed environment and never rely on the development fallback in production.

OIDC discovery and runtime endpoints are rejected unless their exact origins are trusted. Configure `BETTER_AUTH_TRUSTED_ORIGINS` before registering OIDC providers. See the [SSO guide](../../docs/sso/) for the complete OIDC and SAML workflow.

## Storage

Durable auth entities live in PostgreSQL's `auth` schema:

- `user`
- `account`
- `organization`, `member`, and `invitation`
- `team` and `team_member`
- `sso_provider`

Sessions and verification state use Better Auth's secondary-storage bridge.
The bridge supports reads, atomic read-and-delete, TTL-aware writes, deletion,
and counters through the common KV interface. It uses Redis when configured and
otherwise defaults to the shared PostgreSQL `kv.entries` table. Process-local
memory requires `KV_ADAPTER=memory`.

On an empty database, `bootstrapInitialAdmin()` creates the first application
administrator before the API listens:

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

Users provisioned through the Better Auth admin endpoint are treated as
pre-verified because an application administrator controls their initial
credentials. The admin client sends `emailVerified: true`, and a database hook
enforces the same invariant for every `/admin/create-user` request. Existing
accounts are backfilled by database migration `0043`.

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
import { auth, hasSsoProviders, type Auth, type Session } from '@mba-desk/auth'
```

`hasSsoProviders()` returns only whether the durable SSO provider table contains a domain-verified provider. The API uses it for the guest login capability check without exposing provider configuration or presenting an unusable SSO form while DNS verification is pending.

## Verification

```bash
yarn workspace @mba-desk/auth typecheck
yarn workspace @mba-desk/auth test
yarn workspace @mba-desk/auth build
```

Tests cover production environment requirements, initial-admin bootstrap behavior, and the KV secondary-storage bridge without requiring PostgreSQL or Redis.
