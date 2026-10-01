# Shared libraries

The private `@mba-demo/*` libraries define the infrastructure and schema
boundaries shared by applications. Applications may depend on these packages;
libraries must not import from `apps/*`, and consumers should use package
exports rather than sibling source paths.

| Package                                                          | Purpose                        | External mode            | Local fallback                                    |
| ---------------------------------------------------------------- | ------------------------------ | ------------------------ | ------------------------------------------------- |
| [`@mba-demo/db`](db/README.md)                                   | PostgreSQL access and schemas  | PostgreSQL               | Development URL only; no in-memory database       |
| [`@mba-demo/kv`](kv/README.md)                                   | String key/value operations    | Redis                    | Process-local memory                              |
| [`@mba-demo/pubsub`](pubsub/README.md)                           | Transient message fan-out      | Redis Pub/Sub            | Process-local EventEmitter                        |
| [`@mba-demo/events`](events/README.md)                           | Event publishing/subscription  | Kafka                    | Process-local EventEmitter                        |
| [`@mba-demo/files`](files/README.md)                             | File/object storage            | S3-compatible storage    | Persistent local filesystem                       |
| [`@mba-demo/auth`](auth/README.md)                               | Authentication                 | Better Auth + Drizzle    | KV secondary storage follows the selected KV mode |
| [`@mba-demo/runner`](runner/README.md)                           | Versioned JavaScript execution | isolated-vm + PostgreSQL | Injected repository/executor for tests            |
| [`@mba-demo/wa-analytics`](whatsapp/analytics/README.md)         | WhatsApp account analytics     | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-flows`](whatsapp/flows/README.md)                 | WhatsApp Flow management       | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-media`](whatsapp/media/README.md)                 | WhatsApp media lifecycle       | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-messaging`](whatsapp/messaging/README.md)         | Typed WhatsApp message sending | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-mba`](whatsapp/mba/README.md)                     | Meta Business Agent management | MBA Platform API         | Injected fetch for tests                          |
| [`@mba-demo/wa-moderation`](whatsapp/moderation/README.md)       | WhatsApp user blocklist        | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-registration`](whatsapp/registration/README.md)   | Phone-number registration      | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-subscriptions`](whatsapp/subscriptions/README.md) | WABA webhook subscriptions     | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-templates`](whatsapp/templates/README.md)         | WhatsApp template management   | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-waba`](whatsapp/waba/README.md)                   | WABA discovery                 | Graph API                | Injected fetch for tests                          |
| [`@mba-demo/wa-webhooks`](whatsapp/webhooks/README.md)           | Webhook schemas and types      | Zod                      | N/A                                               |

See [`whatsapp/README.md`](whatsapp/README.md) for the complete WhatsApp API
inventory, package boundaries, lifecycle constraints, and integration sequence.

## Package contracts

- Import packages through their workspace name, not by traversing into sibling source directories.
- Public APIs are re-exported from each package's `src/index.ts`.
- Package exports point to TypeScript source under the `development` condition and compiled JavaScript by default.
- Environment parsing is kept near each adapter and fails early for invalid or partial production configuration.
- External clients connect lazily where practical and expose explicit shutdown functions.
- In-memory adapters implement the same public interface as their external counterparts but are process-local and non-durable.
- Tests avoid requiring live infrastructure; Compose smoke tests cover real service wiring.

Applications own process lifecycle. Libraries provide `close()` or equivalent functions, while `apps/api` calls them during graceful shutdown.
