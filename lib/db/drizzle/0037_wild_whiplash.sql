ALTER TABLE "auth"."team" ADD COLUMN "default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
WITH "ranked_teams" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id"
			ORDER BY "created_at", "id"
		) AS "position"
	FROM "auth"."team"
)
UPDATE "auth"."team" AS "team"
SET "default" = true
FROM "ranked_teams"
WHERE "team"."id" = "ranked_teams"."id"
	AND "ranked_teams"."position" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "team_one_default_per_organization_idx"
	ON "auth"."team" ("organization_id")
	WHERE "default" = true;
