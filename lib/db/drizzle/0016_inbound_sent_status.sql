UPDATE "mba"."messages"
SET
  "status" = 'sent',
  "status_updated_at" = now()
WHERE
  "direction" = 'inbound'
  AND ("status" IS NULL OR "status" = 'received');
