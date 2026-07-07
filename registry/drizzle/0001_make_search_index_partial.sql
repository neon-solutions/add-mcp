DROP INDEX IF EXISTS "api_requests_search_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_requests_search_idx" ON "api_requests" USING btree ("search") WHERE "api_requests"."search" is not null and "api_requests"."search" <> '';
