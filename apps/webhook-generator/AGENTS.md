# Webhook generator agent guide

This workspace is a stateful, schema-valid load generator. Preserve realistic
ordering and identity semantics; it is not a collection of independent random
payloads.

## Generation invariants

- Build payloads against `@mba-desk/wa-webhooks` and validate every generated event
  before delivery or dry-run output.
- Ordinary incoming messages use `messages`; MBA-agent-owned incoming messages
  use `standby`.
- Emit the matching incoming message immediately after ownership handover:
  `standby` for the agent and `messages` for the human/application side.
- Only outbound `smb_message_echoes` enter the delivery state machine. Reuse
  their message ID for `sent -> delivered -> read` status events in that order.
- Emit group lifecycle before group traffic. Do not invent group send statuses
  unless the data model can associate them with a group chat.
- Keep created message/media/request/handover/agent IDs unique for a run; status
  events are the intentional ID reuse.
- Keep unstandardized handover fields additive and lossless rather than
  asserting a closed Meta event taxonomy.

## Runner and transport

- Preserve seeded/repeatable pool generation and validate configuration before
  beginning a run.
- Respect RPS pacing, `maxInFlight` backpressure, event/duration limits, and
  abort signals. Await all in-flight sends before returning final statistics.
- Sign live requests using the exact serialized body and Meta's
  `X-Hub-Signature-256` convention. Dry-run mode must not perform network I/O.
- Never log or bake an app secret into fixtures, defaults, or generated output.

## Verification

```bash
yarn workspace @mba-desk/webhook-generator typecheck
yarn workspace @mba-desk/webhook-generator test
yarn workspace @mba-desk/webhook-generator build
```

Tests should cover ordering/state transitions, uniqueness, deterministic
generation where applicable, signing, pacing/backpressure, and cancellation.
