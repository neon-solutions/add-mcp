import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../db/schema";

const databaseUrl = process.env.DATABASE_URL;

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

/**
 * Shared analytics database handle. Available whenever DATABASE_URL is set;
 * write-side recording is additionally gated by ENABLE_ANALYTICS.
 */
export function getAnalyticsDb(): NodePgDatabase<typeof schema> | undefined {
  if (!databaseUrl) {
    return undefined;
  }
  pool ??= new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
  });
  db ??= drizzle(pool, { schema });
  return db;
}
