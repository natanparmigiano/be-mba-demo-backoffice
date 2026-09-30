# `@mba-demo/webhook-generator`

Stateful CLI load generator for the application's WhatsApp Cloud API webhook endpoint. It creates contact and group pools once, emits schema-valid payloads at a configured request rate, and signs live requests with Meta's `X-Hub-Signature-256` convention.

## Event behavior

The generator follows the checked-in Cloud API webhook examples and the shared `@mba-demo/schemas` contract:

- Incoming text, image, location, interactive reply, and reaction messages use the standard `messages` envelope.
- MBA-agent-owned incoming messages use `value.standby[]`. Ordinary `value.messages[]` means the human/application side owns the conversation.
- A handover to the MBA agent is immediately followed by a `standby` message. A handback to the human/application side is immediately followed by a `messages` message.
- Outbound sends are represented by `smb_message_echoes`; only those IDs enter the status state machine, in the order `sent`, `delivered`, `read`.
- Groups receive a lifecycle event before message traffic and periodic settings events. Group send statuses are not invented because this application cannot currently associate a group message echo with a group chat.
- Every created message, media, request, handover, and agent-event ID is unique for the process run. Status notifications intentionally reuse their outbound message ID, as required by the Cloud API contract.

`messaging_handovers` has no closed public event taxonomy. The shared contract therefore types its stable correlation, ownership, and agent fields while retaining additive fields losslessly. The generator emits explicit `handover` and `agent_event` records; the synthetic ownership names are `human_app` and `agent` to make standby routing unambiguous.

## Usage

Inspect a short stream without making requests:

```bash
yarn workspace @mba-demo/webhook-generator dev -- \
  --dry-run --contacts 20 --groups 3 --group-size 4 --rps 25 --events 100
```

Send signed traffic to a configured local channel:

```bash
WA_APP_SECRET=the-channel-app-secret \
yarn workspace @mba-demo/webhook-generator dev -- \
  --target http://localhost:3000/api/wa-cloud/webhook/1 \
  --waba-id the-channel-waba-id \
  --phone-number-id the-channel-phone-number-id \
  --display-phone-number 15550001111 \
  --contacts 1000 --groups 50 --group-size 8 --rps 200 --duration 60
```

The WABA ID and both phone-number values must match the channel stored by the API. Use `--app-secret` instead of `WA_APP_SECRET` when preferred. Without `--events` or `--duration`, the process runs until `SIGINT` or `SIGTERM`.

Run `yarn workspace @mba-demo/webhook-generator dev -- --help` for every option.

## Verification

```bash
yarn workspace @mba-demo/webhook-generator typecheck
yarn workspace @mba-demo/webhook-generator test
yarn workspace @mba-demo/webhook-generator build
```
