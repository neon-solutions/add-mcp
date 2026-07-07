CREATE TABLE IF NOT EXISTS "api_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"route" text NOT NULL,
	"status" integer NOT NULL,
	"search" text,
	"limit_value" integer,
	"cursor_present" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	"referrer" text,
	"ip_hash" text,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_requests_created_at_idx" ON "api_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_requests_search_idx" ON "api_requests" USING btree ("search");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_requests_route_created_at_idx" ON "api_requests" USING btree ("route","created_at" DESC NULLS LAST);
