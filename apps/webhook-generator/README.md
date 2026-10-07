# `@mba-desk/webhook-generator`

Use this stateful CLI to generate schema-valid WhatsApp Cloud API and MBA
webhook traffic with realistic identity, ownership, and status ordering. It
reuses contact and group pools, paces requests, and signs live bodies with
Meta's `X-Hub-Signature-256` convention.

## Quick start

Inspect a short stream without network requests:

```bash
yarn workspace @mba-desk/webhook-generator dev -- \
  --dry-run --contacts 20 --groups 3 --group-size 4 --rps 25 --events 100
```

Run `yarn workspace @mba-desk/webhook-generator dev -- --help` for every option.

## Event behavior

The generator follows the checked-in Cloud API webhook examples and validates
every payload against the shared `@mba-desk/wa-webhooks` contract:

- Incoming text, image, location, interactive reply, and reaction messages use the standard `messages` envelope.
- MBA-agent-owned traffic uses `field: standby` and groups contacts, messages, message echoes, or statuses under `value.standby`. Ordinary incoming messages continue to use `field: messages` and `value.messages[]`.
- A handover to the MBA agent is immediately followed by a `standby` message. A handback to the human/application side is immediately followed by a `messages` message.
- Human/application outbound sends use `smb_message_echoes`; Business AI outbound sends use nested `standby.message_echoes`. Both forms enter the status state machine in the order `sent`, `delivered`, `read`, with Business AI statuses nested under `standby.statuses`.
- Groups receive a lifecycle event before message traffic and periodic settings events. Group send statuses are not invented because this application cannot currently associate a group message echo with a group chat.
- Every created message, media, request, and handover ID is unique for the process run. Status notifications intentionally reuse their outbound message ID, as required by the observed Cloud API contract.

Observed `messaging_handovers` callbacks carry one `control_passed` event directly in `value`, with the business number in `recipient`, the customer in `sender`, and ownership roles in `control_passed`. The generator uses `ai_agent` and `escalation` as the provider roles while retaining additive fields losslessly.

Observed standby status IDs refer to the outbound message echo. They do not
represent the Business AI reading an inbound customer message.

## Send live traffic

Send signed traffic to a configured local channel:

```bash
WA_APP_SECRET=the-channel-app-secret \
yarn workspace @mba-desk/webhook-generator dev -- \
  --target http://localhost:3000/api/wa-cloud/webhook/1 \
  --waba-id the-channel-waba-id \
  --phone-number-id the-channel-phone-number-id \
  --display-phone-number 15550001111 \
  --contacts 1000 --groups 50 --group-size 8 --rps 200 --duration 60
```

The WABA ID and both phone-number values must match the channel stored by the
API. Use `--app-secret` instead of `WA_APP_SECRET` when preferred. Without
`--events` or `--duration`, the process runs until `SIGINT` or `SIGTERM`.

## Verification

```bash
yarn workspace @mba-desk/webhook-generator typecheck
yarn workspace @mba-desk/webhook-generator test
yarn workspace @mba-desk/webhook-generator build
```
