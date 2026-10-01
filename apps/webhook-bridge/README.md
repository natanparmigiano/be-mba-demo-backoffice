# PostgreSQL webhook bridge

`@mba-demo/webhook-bridge` is a small testing CLI that drains captured WhatsApp
webhooks from a remote PostgreSQL table into the application's normal webhook
event topic.

## Run

Configure the same Kafka cluster used by the API worker, then provide the source
database URL and destination channel ID:

```bash
KAFKA_CLIENT_ID=webhook-bridge \
KAFKA_BROKERS=localhost:9092 \
yarn workspace @mba-demo/webhook-bridge dev -- \
  --database-url 'postgresql://user:password@host/database?sslmode=require' \
  --channel-id 42
```

Use `--batch-size <count>` to change the default batch size of 100. The table
must already exist as `public.whatsapp_webhook_deliveries` with the schema
provided for this bridge.

The CLI requires Kafka configuration. The event library's memory adapter is
process-local and cannot transfer events from this standalone process to the
API or worker.

## Processing behavior

Once per second the bridge:

1. starts a PostgreSQL transaction;
2. locks the oldest rows with `FOR UPDATE SKIP LOCKED`;
3. checks source validity, the API's 1 MiB limit, JSON syntax, and the
   `@mba-demo/wa-webhooks` schema for diagnostic purposes;
4. publishes every original `raw_payload` to `wa-cloud.webhook.v1`, including
   payloads that fail those checks, with the destination channel ID as both the
   event key and `channel-id` header; and
5. deletes processed rows before committing the transaction.

The event headers match the API webhook route:

```text
channel-id: <channel-id>
content-type: application/json
source: wa-cloud-webhook
```

Rows are deleted only after they are successfully published. A publish failure
rolls back the batch, retaining its rows for the next poll. PostgreSQL and Kafka
cannot share one atomic transaction, so a crash after Kafka acknowledges a
publish but before PostgreSQL commits can produce a duplicate. Downstream
webhook ingestion is already designed to be idempotent under webhook retries.

Invalid rows are diagnostic failures, not bridge rejections. Before publishing
one, the bridge appends a JSON object to `fails.jsonl` in the bridge process's
current working directory and logs every Zod issue code, JSON path, and message.
Each line contains the capture time, channel and delivery IDs, source validity,
validation-failure reason, and exact raw payload. The file is created with owner-only
permissions and contains customer webhook data, so it must remain local and be
handled as sensitive data. Failure-file errors are logged but do not prevent
publication. Console output continues to contain only the row ID and validation
details. The worker remains responsible for accepting or rejecting the event.

`SIGINT` and `SIGTERM` stop polling after the active batch and close both Kafka
and PostgreSQL clients.

## Verification

```bash
yarn workspace @mba-demo/webhook-bridge typecheck
yarn workspace @mba-demo/webhook-bridge test
yarn workspace @mba-demo/webhook-bridge build
```
