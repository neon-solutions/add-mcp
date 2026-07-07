import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const apiRequests = pgTable(
  "api_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    route: text("route").notNull(),
    status: integer("status").notNull(),
    search: text("search"),
    limitValue: integer("limit_value"),
    cursorPresent: boolean("cursor_present").notNull().default(false),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    ipHash: text("ip_hash"),
    durationMs: integer("duration_ms").notNull(),
  },
  (table) => [
    index("api_requests_created_at_idx").on(table.createdAt.desc()),
    index("api_requests_search_idx")
      .on(table.search)
      .where(sql`${table.search} is not null and ${table.search} <> ''`),
    index("api_requests_route_created_at_idx").on(
      table.route,
      table.createdAt.desc(),
    ),
  ],
);
