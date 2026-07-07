import path from "node:path";

import { unstable_cache } from "next/cache";

import { getPopularityScores } from "./analytics/popularity";
import { getSearchStats, type SearchStats } from "./analytics/search-stats";
import { loadRegistryFromFile } from "./load-registry";
import {
  matchesNormalizedSearch,
  normalizeSearch,
  queryServers,
} from "./query-servers";
import type { ServerEntry } from "./schema";

const PAGE_SIZE = 20;

type PageResult = {
  servers: ServerEntry[];
  pageIndex: number;
  prevPageIndex?: number;
  nextPageIndex?: number;
  /** Total servers matching the current search. */
  totalCount: number;
  /** Total pages for the current search. */
  totalPages: number;
  /** Per-server search counts for the returned page, when analytics exist. */
  searchCounts: Record<string, { allTime: number; thisWeek: number }>;
};

export type RegistryOverview = {
  totalServers: number;
  searchStats: SearchStats | null;
};

export function getSourcePath(): string {
  return (
    process.env.MCP_REGISTRY_SOURCE_PATH ??
    path.resolve(process.cwd(), "fixtures/registry.json")
  );
}

const loadRegistryCached = unstable_cache(
  async () => loadRegistryFromFile(getSourcePath()),
  ["registry-entries"],
  { revalidate: 300 },
);

export async function getAllServers(): Promise<ServerEntry[]> {
  return loadRegistryCached();
}

export async function getServerByName(
  name: string,
): Promise<ServerEntry | undefined> {
  const entries = await loadRegistryCached();
  return entries.find((entry) => entry.server.name === name);
}

export type SearchCount = {
  allTime: number;
  thisWeek: number;
  /** Daily counts (oldest first) over the analytics daily window. */
  daily?: number[];
};

export type RelatedServer = {
  entry: ServerEntry;
  searchCount?: SearchCount;
};

export type ServerPageData = {
  entry: ServerEntry;
  searchCount?: SearchCount;
  related: RelatedServer[];
};

const RELATED_LIMIT = 4;

export async function getServerPageData(
  name: string,
): Promise<ServerPageData | undefined> {
  const entries = await loadRegistryCached();
  const entry = entries.find((e) => e.server.name === name);
  if (!entry) {
    return undefined;
  }

  const popularity = await getPopularityScores(entries);
  const namespace = name.split("/")[0];

  const related = entries
    .filter(
      (e) =>
        e.server.name !== name && e.server.name.split("/")[0] === namespace,
    )
    .sort((a, b) => {
      const scoreA = popularity?.get(a.server.name)?.allTime ?? 0;
      const scoreB = popularity?.get(b.server.name)?.allTime ?? 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      const labelA = a.server.title ?? a.server.name;
      const labelB = b.server.title ?? b.server.name;
      return labelA.localeCompare(labelB);
    })
    .slice(0, RELATED_LIMIT)
    .map((e) => {
      const score = popularity?.get(e.server.name);
      return {
        entry: e,
        // Cards don't render daily series; keep the RSC payload lean.
        searchCount: score
          ? { allTime: score.allTime, thisWeek: score.thisWeek }
          : undefined,
      };
    });

  return {
    entry,
    searchCount: popularity?.get(name),
    related,
  };
}

export async function getRegistryOverview(): Promise<RegistryOverview> {
  const [entries, searchStats] = await Promise.all([
    loadRegistryCached(),
    getSearchStats(),
  ]);

  return {
    totalServers: entries.length,
    searchStats,
  };
}

export async function listServersByPage(input: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PageResult> {
  const entries = await loadRegistryCached();
  const popularity = await getPopularityScores(entries);
  const search = (input.search ?? "").trim();
  const limit = input.limit ?? PAGE_SIZE;
  const requestedPage = input.page ?? 0;
  const safePage =
    Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;

  let cursor: string | undefined;
  let currentPage = 0;
  let result = queryServers(
    entries,
    {
      search,
      limit: String(limit),
    },
    { popularity },
  );

  while (currentPage < safePage && result.metadata.nextCursor) {
    cursor = result.metadata.nextCursor;
    currentPage += 1;
    result = queryServers(
      entries,
      {
        search,
        limit: String(limit),
        cursor,
      },
      { popularity },
    );
  }

  const reachedRequestedPage = currentPage === safePage;

  const normalizedSearch = normalizeSearch(search);
  const totalCount = entries.filter((entry) =>
    matchesNormalizedSearch(entry, normalizedSearch),
  ).length;

  const searchCounts: PageResult["searchCounts"] = {};
  if (popularity) {
    for (const entry of result.servers) {
      const score = popularity.get(entry.server.name);
      if (score) {
        // Cards don't render daily series; keep the RSC payload lean.
        searchCounts[entry.server.name] = {
          allTime: score.allTime,
          thisWeek: score.thisWeek,
        };
      }
    }
  }

  return {
    servers: result.servers,
    pageIndex: currentPage,
    prevPageIndex: currentPage > 0 ? currentPage - 1 : undefined,
    nextPageIndex:
      reachedRequestedPage && result.metadata.nextCursor
        ? currentPage + 1
        : undefined,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    searchCounts,
  };
}
