# Repository agent guide

These instructions apply to the whole repository. A more deeply nested
`AGENTS.md` adds subsystem-specific rules for files below it. Human-facing
documentation is authored for Docusaurus under `documentation/docs/`. The
previous reference corpus is preserved under `documentation/docs/archive/`,
with source areas mirrored below it (for example,
`documentation/docs/archive/apps/web-workspace/`). Read the matching archived
reference before changing a subsystem, and prefer adding new onboarding guides
outside the archive. Keep `AGENTS.md` files beside the code.

## Documentation

- Treat `documentation/docs/` as the only source for human-facing
  documentation. Do not add README files beside source packages.
- Existing reference material lives under `documentation/docs/archive/` until
  it is rewritten into reader-focused guides outside the archive. Keep the
  archived reference accurate while it remains the only page covering a
  changed behavior.
- For paired audience documentation, the unmarked `.md` page is the external
  Workspace-only version. Use the `.internal.md` suffix and an `[INTERNAL]`
  title label for the version that includes Management. Update both versions
  together, list the internal variant before the external variant in
  navigation, and never mention Management-only features in the external page.
- Keep Docusaurus front matter, friendly titles, category metadata, links, and
  navigation labels accurate when adding, moving, or renaming pages.
- Write pages using an inverted pyramid: introduction and essential facts,
  quick start, normal workflows, detailed reference, then troubleshooting and
  internals.
- Add new onboarding pages outside `archive/` and give them an appropriate
  place in Docusaurus navigation. Do not move an archived page back unchanged;
  rewrite it for the intended reader and learning path.

## Repository shape

- This is a private Yarn 1.22 workspaces monorepo requiring Node.js 24+.
- `apps/api-workspace` and `apps/api-manager` are the separate Hono HTTP
  applications and exported RPC type boundaries.
- `apps/web-workspace` and `apps/web-manager` are the matching React/Vite
  browser applications.
- `apps/sso-cli` owns the HTTP-based SSO provider administration CLI.
- `lib/api-core` contains neutral API lifecycle and shared routes;
  `lib/api-workspace-core` and `lib/api-manager-core` contain application-owned
  routes and subscriber registries.
- Other `lib/*` and `lib/whatsapp/*` directories contain shared packages.
  Applications may depend on libraries; libraries must not depend on
  applications.
- The production image serves each compiled web application from its matching
  Hono server and provides separate Workspace and Manager app and worker roles.

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
- Add or update focused tests with behavior changes. Keep the matching active
  guide, or archived reference when no replacement exists, synchronized with
  new routes, variables, commands, or deployment behavior.

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
