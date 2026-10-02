CREATE TABLE "mba"."webhooks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mba"."webhooks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"processing_time_ms" integer NOT NULL,
	"total_time_ms" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mba"."webhooks" ADD CONSTRAINT "webhooks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "mba"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhooks_channel_id_arrived_at_idx" ON "mba"."webhooks" USING btree ("channel_id","arrived_at");--> statement-breakpoint
CREATE INDEX "webhooks_arrived_at_idx" ON "mba"."webhooks" USING btree ("arrived_at");