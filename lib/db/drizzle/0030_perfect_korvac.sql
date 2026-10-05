CREATE SCHEMA "llm";
--> statement-breakpoint
CREATE TABLE "llm"."response_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm"."response_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"session_id" text,
	"authentication_state" jsonb NOT NULL,
	"model" text,
	"streamed" boolean DEFAULT false NOT NULL,
	"provider_status" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"token_usage" jsonb,
	"input" jsonb NOT NULL,
	"output" jsonb,
	CONSTRAINT "response_requests_duration_nonnegative_check" CHECK ("llm"."response_requests"."duration_ms" >= 0),
	CONSTRAINT "response_requests_provider_status_check" CHECK ("llm"."response_requests"."provider_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE INDEX "response_requests_organization_requested_at_idx" ON "llm"."response_requests" USING btree ("organization_id","requested_at");--> statement-breakpoint
CREATE INDEX "response_requests_user_requested_at_idx" ON "llm"."response_requests" USING btree ("user_id","requested_at");