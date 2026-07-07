import { createHash } from "node:crypto";

import { apiRequests } from "../db/schema";
import { getAnalyticsDb } from "./db";

type ApiRequestAnalytics = {
  method: string;
  path: string;
  status: number;
  search?: string;
  limit?: string;
  cursorPresent: boolean;
  userAgent?: string;
  referrer?: string;
  ip?: string;
  durationMs: number;
};

const enabled = process.env.ENABLE_ANALYTICS === "true";
const analyticsSalt = process.env.ANALYTICS_SALT;

function getDb() {
  if (!enabled) {
    return undefined;
  }
  return getAnalyticsDb();
}

function parseLimit(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function routeForPath(path: string): string {
  if (path === "/api/health") return "/api/health";
  if (path === "/api/openapi.json") return "/api/openapi.json";
  if (path === "/api/v1/servers") return "/api/v1/servers";
  return path;
}

function hashIp(ip: string | undefined): string | null {
  if (!ip || !analyticsSalt) return null;
  return createHash("sha256").update(`${analyticsSalt}:${ip}`).digest("hex");
}

export async function recordApiRequest(
  event: ApiRequestAnalytics,
): Promise<void> {
  const analyticsDb = getDb();
  if (!analyticsDb) {
    return;
  }

  try {
    await analyticsDb.insert(apiRequests).values({
      method: event.method,
      path: event.path,
      route: routeForPath(event.path),
      status: event.status,
      search: event.search?.trim() || null,
      limitValue: parseLimit(event.limit),
      cursorPresent: event.cursorPresent,
      userAgent: event.userAgent || null,
      referrer: event.referrer || null,
      ipHash: hashIp(event.ip),
      durationMs: event.durationMs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown analytics error";
    console.error("Failed to record API analytics:", message);
  }
}
