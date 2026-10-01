UPDATE "mba"."messages"
SET
  "status" = 'delivered',
  "status_updated_at" = now()
WHERE
  "direction" = 'inbound'
  AND (
    "status" IS NULL
    OR "status" IN ('received', 'sent')
  );
