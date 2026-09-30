# Shared libraries

The `lib` workspaces contain backend infrastructure adapters and configuration. They are private Yarn packages under the `@mba-demo/*` scope.

| Package                                  | Purpose                       | External mode         | Local fallback                                    |
| ---------------------------------------- | ----------------------------- | --------------------- | ------------------------------------------------- |
| [`@mba-demo/db`](db/README.md)           | PostgreSQL access and schemas | PostgreSQL            | Development URL only; no in-memory database       |
| [`@mba-demo/kv`](kv/README.md)           | String key/value operations   | Redis                 | Process-local memory                              |
| [`@mba-demo/events`](events/README.md)   | Event publishing/subscription | Kafka                 | Process-local EventEmitter                        |
| [`@mba-demo/auth`](auth/README.md)       | Authentication                | Better Auth + Drizzle | KV secondary storage follows the selected KV mode |
| [`@mba-demo/schemas`](schemas/README.md) | Shared application schemas    | Zod                   | N/A                                               |

## Conventions

- Import packages through their workspace name, not by traversing into sibling source directories.
- Public APIs are re-exported from each package's `src/index.ts`.
- Package exports point to TypeScript source under the `development` condition and compiled JavaScript by default.
- Environment parsing is kept near each adapter and fails early for invalid or partial production configuration.
- External clients connect lazily where practical and expose explicit shutdown functions.
- In-memory adapters implement the same public interface as their external counterparts but are process-local and non-durable.
- Tests avoid requiring live infrastructure; Compose smoke tests cover real service wiring.

Applications own process lifecycle. Libraries provide `close()` or equivalent functions, while `apps/api` calls them during graceful shutdown.
