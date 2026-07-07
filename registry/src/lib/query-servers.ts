import type { ServerEntry } from "./schema";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

type QueryInput = {
  search?: string;
  cursor?: string;
  limit?: string;
};

type PopularityLookup = {
  get(name: string): { allTime: number; thisWeek: number } | undefined;
};

type QueryOptions = {
  /**
   * Optional search popularity per server name. When provided, unfiltered
   * results are ordered by all-time searches (desc) before the alphabetical
   * fallback.
   */
  popularity?: PopularityLookup | null;
};

type QueryResult = {
  servers: ServerEntry[];
  metadata: {
    count: number;
    nextCursor?: string;
  };
};

type CursorPayload = {
  offset: number;
  search: string;
};

export function normalizeSearch(search: string | undefined): string {
  return (search ?? "").trim().toLowerCase();
}

const NOISE_SEGMENTS = new Set(["com", "io", "github", "app", "mcp"]);
const HOSTED_PROVIDER_NAMESPACE_PREFIXES: Record<string, string[]> = {
  vercel: ["app.vercel."],
};

function sortLabel(entry: ServerEntry): string {
  if (entry.server.title) {
    return entry.server.title.toLowerCase();
  }
  return entry.server.name
    .split(/[./]/)
    .filter((seg) => seg && !NOISE_SEGMENTS.has(seg))
    .join(" ")
    .toLowerCase();
}

function parseLimit(limit: string | undefined): number {
  if (!limit) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      "Invalid 'limit' query parameter. It must be a positive integer.",
    );
  }

  return Math.min(parsed, MAX_LIMIT);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<CursorPayload>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.offset !== "number" ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0 ||
      typeof parsed.search !== "string"
    ) {
      throw new Error("Malformed cursor payload");
    }
    return { offset: parsed.offset, search: parsed.search };
  } catch {
    throw new Error("Invalid 'cursor' query parameter.");
  }
}

/**
 * The search query that reliably matches a server by name via the API/UI
 * search (hosted-provider prefixes like `io.github.` are not searchable).
 */
export function searchQueryForServerName(name: string): string {
  return meaningfulName(name);
}

function meaningfulName(name: string): string {
  const normalized = name.toLowerCase();

  if (normalized.startsWith("io.github.")) {
    return normalized.slice("io.github.".length);
  }

  if (normalized.startsWith("app.vercel.")) {
    return normalized.slice("app.vercel.".length);
  }

  return normalized;
}

function repositorySearchText(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com") {
      return parsed.pathname.split("/").filter(Boolean).join(" ");
    }
    return `${parsed.hostname} ${parsed.pathname}`;
  } catch {
    return url;
  }
}

function searchableText(entry: ServerEntry): string {
  const server = entry.server;
  const parts = [
    meaningfulName(server.name),
    server.title ?? "",
    repositorySearchText(server.repository?.url),
    ...(server.packages ?? []).map((pkg) => pkg.identifier),
    ...(server.remotes ?? []).map((remote) => remote.url),
  ];

  return parts.join(" ").toLowerCase();
}

function isHostedProviderNamespaceMatchOnly(
  entry: ServerEntry,
  search: string,
): boolean {
  const prefixes = HOSTED_PROVIDER_NAMESPACE_PREFIXES[search];
  if (!prefixes) {
    return false;
  }

  const name = entry.server.name.toLowerCase();
  return prefixes.some((prefix) => name.startsWith(prefix));
}

/** `search` must already be normalized via {@link normalizeSearch}. */
export function matchesNormalizedSearch(
  entry: ServerEntry,
  search: string,
): boolean {
  if (!search) {
    return true;
  }

  if (isHostedProviderNamespaceMatchOnly(entry, search)) {
    return false;
  }

  return searchableText(entry).includes(search);
}

function compareEntries(
  a: ServerEntry,
  b: ServerEntry,
  popularity: PopularityLookup | null | undefined,
): number {
  if (popularity) {
    const scoreA = popularity.get(a.server.name)?.allTime ?? 0;
    const scoreB = popularity.get(b.server.name)?.allTime ?? 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
  }
  return sortLabel(a).localeCompare(sortLabel(b));
}

export function queryServers(
  entries: ServerEntry[],
  input: QueryInput,
  options: QueryOptions = {},
): QueryResult {
  const search = normalizeSearch(input.search);
  const limit = parseLimit(input.limit);

  let offset = 0;
  if (input.cursor) {
    const cursorPayload = decodeCursor(input.cursor);
    if (cursorPayload.search !== search) {
      throw new Error("Cursor does not match current search filter.");
    }
    offset = cursorPayload.offset;
  }

  const filtered = entries
    .slice()
    .sort((a, b) => compareEntries(a, b, options.popularity))
    .filter((entry) => matchesNormalizedSearch(entry, search));

  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor =
    nextOffset < filtered.length
      ? encodeCursor({ offset: nextOffset, search })
      : undefined;

  return {
    servers: page,
    metadata: {
      count: page.length,
      ...(nextCursor ? { nextCursor } : {}),
    },
  };
}
