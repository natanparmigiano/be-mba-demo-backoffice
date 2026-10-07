-- Existing accounts were provisioned by application administrators before
-- admin-created users were marked verified at creation time.
UPDATE "auth"."user"
SET "email_verified" = true
WHERE "email_verified" = false;
