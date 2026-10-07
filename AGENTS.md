# Repository agent guide

These instructions apply to the whole repository. A more deeply nested
`AGENTS.md` adds subsystem-specific rules for files below it. Read the nearest
README before changing a subsystem; the READMEs document intentional contracts
and should be updated when behavior changes.

## Repository shape

- This is a private Yarn 1.22 workspaces monorepo requiring Node.js 20.19+.
- `apps/api` owns the Hono HTTP server, process lifecycle, workers, and the
  exported RPC `AppType`.
- `apps/web` owns the React/Vite browser application.
- `apps/sso-cli` owns the HTTP-based SSO provider administration CLI.
- `lib/*` and `lib/whatsapp/*` contain shared packages. Applications may depend
  on libraries; libraries must not depend on applications.
- The production image serves the compiled web application from Hono and uses
  separate `app` and `worker` roles where configured.

## General conventions

- Keep TypeScript strict and preserve the existing ESM style. Backend relative
  imports use `.js` extensions in TypeScript source.
- Import other workspaces through their `@mba-desk/*` package names. Do not
  reach into sibling workspace source directories.
- Keep public library APIs behind their documented exports or `src/index.ts`.
- Do not edit generated `dist/`, coverage, or `*.tsbuildinfo` files.
- Never commit credentials or production secrets. Treat `.env` as local user
  state; use `.env.example` and `.env.dev` only for documented safe defaults.
- Preserve lazy external connections and explicit graceful shutdown. The API,
  not shared libraries, owns process lifecycle.
- Add or update focused tests with behavior changes. Keep documentation and
  configuration tables synchronized with new routes, variables, commands, or
  deployment behavior.

## Validation

Run the smallest relevant workspace checks while iterating, then use broader
checks in proportion to the change:

```bash
yarn workspace <workspace-name> typecheck
yarn workspace <workspace-name> test   # workspaces that define tests
yarn workspace <workspace-name> build
yarn format:check
yarn lint
yarn quality                            # full repository gate
```

`yarn quality` runs formatting, linting, every workspace typecheck, and all
configured backend/CLI tests. The web workspace currently has typecheck/build
checks but no test script.

## Generated and operational changes

- After Better Auth configuration/plugin changes, run `yarn auth:generate`,
  review `lib/db/src/schema/auth.ts`, then run `yarn db:generate`.
- After application schema changes, run `yarn db:generate` and review both SQL
  and migration metadata before applying with `yarn db:migrate`.
- The Kafka adapter uses Confluent's native `librdkafka` binding. When changing
  Node.js or `@confluentinc/kafka-javascript`, verify that prebuilt binaries
  exist for every supported development and container platform.
- Compose files contain local/demo defaults. Do not present their credentials,
  auth URLs, or memory adapters as production-safe configuration.
