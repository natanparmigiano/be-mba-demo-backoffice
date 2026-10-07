ALTER TABLE "auth"."team" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "auth"."team" SET "slug" = 'team-' || md5("id");--> statement-breakpoint
ALTER TABLE "auth"."team" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."team" ADD COLUMN "color" text DEFAULT '#0866ff' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."team" ADD CONSTRAINT "team_slug_unique" UNIQUE("slug");
