UPDATE "mba"."messages"
SET
  "status" = 'received',
  "status_updated_at" = now()
WHERE
  "direction" = 'inbound'
  AND "status" IS NULL;
