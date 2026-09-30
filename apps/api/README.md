# `@mba-demo/api`

The Node.js Hono application. It exposes the HTTP API, mounts Better Auth, publishes events, optionally runs event subscribers in-process, and serves the compiled static application in production.

## Source layout

| File                        | Responsibility                                            |
| --------------------------- | --------------------------------------------------------- |
| `src/app.ts`                | Composes the Hono application and exports `AppType`       |
| `src/index.ts`              | Starts the HTTP process and coordinates graceful shutdown |
| `src/worker.ts`             | Starts the standalone subscriber process                  |
| `src/worker-config.ts`      | Parses worker-related environment variables               |
| `src/subscribers.ts`        | Declares the topic-to-handler registry                    |
| `src/routes/events.ts`      | Validated demo event publisher                            |
| `src/routes/wa-cloud.ts`    | Verified WA Cloud webhook receiver and publisher          |
| `src/app.test.ts`           | API contract and static-serving tests                     |
| `src/worker-config.test.ts` | Worker configuration tests                                |

## HTTP surface

| Method        | Path                        | Description                                                         |
| ------------- | --------------------------- | ------------------------------------------------------------------- |
| `GET`         | `/api/health`               | Returns `{ status: "ok", runtime: "node" }`                         |
| `GET`, `POST` | `/api/auth/**`              | Delegates requests to Better Auth                                   |
| `POST`        | `/api/events`               | Publishes `{ message, key? }` to `demo.events.v1` and returns `202` |
| `GET`         | `/api/wa-cloud/webhook/:id` | Completes Meta's challenge using the channel verification token     |
| `POST`        | `/api/wa-cloud/webhook/:id` | Verifies and publishes a typed webhook to `wa-cloud.webhook.v1`     |

JSON input is validated with Zod through Hono's validator middleware. API CORS permits `GET`, `POST`, and `OPTIONS`, allows credentials, and trusts `CORS_ORIGIN`.

The WA Cloud route accepts a positive numeric channel ID that must resolve to a WhatsApp channel. GET subscription challenges are checked against that channel's `wa_webhook_verify_token`. POST requests are limited to JSON payloads of 1 MiB, verified against the channel's `wa_app_secret` using `X-Hub-Signature-256`, validated with the complete webhook Zod schema, and checked against the channel's WABA and phone-number metadata before publication. The original body is retained as the event value so signature fidelity and lossless processing are preserved.

The subscriber validates the event again and persists contacts, groups, chats, messages, and message status history in one transaction. Webhook retries are idempotent through unique indexes; out-of-order message statuses cannot regress the current projection.

## Application construction

`createApp()` accepts optional `corsOrigin`, `eventBus`, `waCloudWebhook`, and `webRoot` values. This keeps route tests independent from external infrastructure and allows production to supply its static build directory.

When `webRoot` is set, Hono:

1. Serves fingerprinted files below `/assets/*`.
2. Returns `index.html` for other non-API GET requests to support client-side routing.
3. Preserves JSON 404 responses below `/api`.

Keep route calls chained when editing `src/app.ts`; `AppType` is inferred from that chain and is the RPC contract exported to consumers.

## App process

`src/index.ts`:

1. Validates `PORT` and constructs the app.
2. Counts Better Auth users and creates the one-time generated `admin@meta.com` administrator when the database is empty.
3. Registers subscribers only when `ENABLE_WORKER_IN_PROCESS=true`.
4. Starts Hono with the Node server adapter.
5. Handles `SIGINT` and `SIGTERM` once.
6. Stops subscribers and closes the HTTP server, database, KV store, and event bus.

The default port is `3000`. The default static root is `../web/dist`, relative to the API process working directory.

## Worker process

`src/worker.ts` has no HTTP server. It resolves the selected topics, registers their handlers before starting the event bus, and waits for `SIGINT` or `SIGTERM`. The Docker `worker` role runs this file.

`SUBSCRIBE_TO_TOPICS` defaults to `all`. Otherwise it accepts a comma-separated list such as:

```env
SUBSCRIBE_TO_TOPICS=demo.events.v1,another.topic.v1
```

Values are trimmed and deduplicated. Startup fails when a requested topic is absent from the registry, preventing a silently misconfigured worker.

## Adding an event handler

1. Define and export a stable topic name near its publisher.
2. Implement an `EventHandler`.
3. Add the handler under its topic in `subscriberRegistry` in `src/subscribers.ts`.
4. Add tests for handler behavior and topic selection.
5. Add the topic to `SUBSCRIBE_TO_TOPICS` for workers that should consume it, or keep `all`.

All subscriptions must be registered before `events.start()` because Kafka subscriptions cannot be added to a running adapter through this abstraction.

## Development commands

From the repository root:

```bash
yarn workspace @mba-demo/api dev
yarn workspace @mba-demo/api typecheck
yarn workspace @mba-demo/api test
yarn workspace @mba-demo/api build
```

`dev` loads the root `.env` when present and watches `src/index.ts`. A built app can be started with `yarn workspace @mba-demo/api start`.
