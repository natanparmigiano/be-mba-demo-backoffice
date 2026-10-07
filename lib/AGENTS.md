# Shared library agent guide

Packages below `lib` are infrastructure or schema boundaries shared by
applications.

## Package contracts

- Do not import from `apps/*`. Import peer libraries only through their
  `@mba-desk/*` workspace names.
- Re-export intended public APIs from the package entry point and keep package
  export maps compatible with source under the `development` condition and
  compiled JavaScript by default.
- Parse environment configuration beside the owning adapter. Fail early for
  invalid protocols and partially configured production integrations.
- Connect external clients lazily where practical and expose explicit close
  operations. Libraries must not install signal handlers or exit the process.
- Keep in-memory and external adapters behaviorally equivalent at the public
  interface. Document that memory modes are process-local and non-durable.
- Unit tests must not require live infrastructure; use injected clients or
  in-memory adapters. Compose smoke paths own real service wiring.

## Package-specific cautions

- `auth`: durable entities belong in PostgreSQL's `auth` schema; sessions and
  verification state use the KV secondary-storage bridge. Application admin
  roles and organization roles are distinct. Regenerate rather than manually
  maintaining Better Auth tables.
- `events`: subscribe before `start()`, keep topic names non-empty/stable, and
  treat a closed adapter as permanently closed. Memory delivery awaits all
  handlers; Kafka behavior must retain the same message shape.
- `kv`: match Redis semantics for conditions, TTL return codes, counters, and
  TTL preservation. Numeric inputs and stored counter values must stay safe
  integers.
- `wa-moderation`: enforce Meta's 1,000-user mutation limit, preserve partial
  per-user failures, and never log access tokens or user blocklists.
- `wa-subscriptions`: keep WABA subscription operations on the
  `subscribed_apps` edge, require HTTP(S) callback overrides, and never expose
  access or verification tokens in errors.
- `wa-waba`: preserve the distinction between owned and shared WABA edges,
  normalize Graph API account IDs to strings, and retain cursor pagination.
- `wa-webhooks`: prefer discriminated unions where Meta exposes stable tags.
  Use loose objects to preserve additive Graph API properties, and do not
  pretend undocumented payloads have a closed taxonomy.

## Verification

For a changed package, run its `typecheck`, `test` when defined, and `build`
scripts through `yarn workspace @mba-desk/<name> ...`. Changes to a shared
interface also require checks in every affected consumer workspace.
