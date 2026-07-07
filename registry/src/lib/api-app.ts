import path from "node:path";

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { z } from "zod";

import { getPopularityScores } from "./analytics/popularity";
import { recordApiRequest } from "./analytics/postgres";
import { basePath, stripBasePath } from "./base-path";
import { loadRegistryFromFile } from "./load-registry";
import { queryServers } from "./query-servers";
import { listResponseSchema, type ServerEntry } from "./schema";
import { getSiteConfig } from "./site-config";

const querySchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});
const healthResponseSchema = z.object({ status: z.literal("ok") });

function getSourcePath(): string {
  return (
    process.env.MCP_REGISTRY_SOURCE_PATH ??
    path.resolve(process.cwd(), "fixtures/registry.json")
  );
}

let entriesPromise: Promise<ServerEntry[]> | undefined;
async function getRegistryEntries(): Promise<ServerEntry[]> {
  if (!entriesPromise) {
    entriesPromise = loadRegistryFromFile(getSourcePath());
  }
  return entriesPromise;
}

// Next strips the configured basePath before invoking route handlers, so the
// Hono app always mounts at /api regardless of NEXT_PUBLIC_BASE_PATH.
export const apiApp = new Hono().basePath("/api");

apiApp.use(async (c, next) => {
  const startedAt = performance.now();
  await next();

  const analyticsEvent = {
    // Recorded without the base path so analytics rows and dashboards stay
    // consistent no matter where the registry is mounted.
    path: stripBasePath(c.req.path),
    method: c.req.method,
    status: c.res.status,
    search: c.req.query("search"),
    limit: c.req.query("limit"),
    cursorPresent: Boolean(c.req.query("cursor")),
    userAgent: c.req.header("user-agent"),
    referrer: c.req.header("referer") ?? c.req.header("referrer"),
    ip:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip"),
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };

  void recordApiRequest(analyticsEvent).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "unknown analytics error";
    console.error("Failed to dispatch API analytics:", message);
  });
});

apiApp.get(
  "/health",
  describeRoute({
    tags: ["system"],
    summary: "Health check",
    responses: {
      200: {
        description: "Service is healthy.",
        content: {
          "application/json": {
            schema: resolver(healthResponseSchema),
          },
        },
      },
    },
  }),
  (c) => c.json({ status: "ok" }),
);

apiApp.get(
  "/v1/servers",
  describeRoute({
    tags: ["servers"],
    summary: "List MCP servers",
    description:
      "Returns paginated MCP servers and supports search and cursor pagination.",
    parameters: [
      {
        in: "query",
        name: "search",
        required: false,
        schema: { type: "string" },
        description:
          "Case-insensitive match against server registry metadata and install targets.",
      },
      {
        in: "query",
        name: "cursor",
        required: false,
        schema: { type: "string" },
        description: "Cursor from the previous response for pagination.",
      },
      {
        in: "query",
        name: "limit",
        required: false,
        schema: { type: "string" },
        description: "Maximum number of servers per page.",
      },
    ],
    responses: {
      200: {
        description: "Successful server listing response.",
        content: {
          "application/json": {
            schema: resolver(listResponseSchema),
          },
        },
      },
      400: {
        description: "Invalid query parameters.",
      },
    },
  }),
  async (c) => {
    const parsedQuery = querySchema.parse({
      search: c.req.query("search"),
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });
    const entries = await getRegistryEntries();
    const popularity = await getPopularityScores(entries);

    try {
      const result = queryServers(entries, parsedQuery, { popularity });
      return c.json(listResponseSchema.parse(result));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid query";
      throw new HTTPException(400, { message: detail });
    }
  },
);

apiApp.get(
  "/openapi.json",
  openAPIRouteHandler(apiApp, {
    documentation: {
      info: {
        title: `${getSiteConfig().name} API`,
        version: "1.0.0",
        description:
          "Read-only API for querying MCP registry servers with search and cursor pagination.",
      },
    },
    exclude: ["/api/openapi.json"],
  }),
);

apiApp.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  console.error("Unhandled API error:", message);
  return c.json({ error: "Internal server error" }, 500);
});
