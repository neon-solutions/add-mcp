import { matchesNormalizedSearch, normalizeSearch } from "../query-servers";
import type { ServerEntry } from "../schema";
import { getSearchStats, type SearchStats } from "./search-stats";

export type PopularityScore = {
  allTime: number;
  thisWeek: number;
  /** Daily counts aligned to the stats' dailyWindow (oldest first). */
  daily?: number[];
};

/** Server name -> aggregated search counts. */
export type PopularityScores = Map<string, PopularityScore>;

/**
 * Terms that match more than this many servers are too generic to attribute
 * to specific servers (e.g. partial input like "no" or "gra").
 */
const MAX_MATCHES_PER_TERM = 25;

export function computePopularityScores(
  entries: ServerEntry[],
  stats: SearchStats,
): PopularityScores {
  const scores: PopularityScores = new Map();
  const dailyWindow = stats.dailyWindow;

  for (const { term, allTime, thisWeek, daily } of stats.terms) {
    const normalized = normalizeSearch(term);
    if (!normalized) {
      continue;
    }

    const matches = entries.filter((entry) =>
      matchesNormalizedSearch(entry, normalized),
    );
    if (matches.length === 0 || matches.length > MAX_MATCHES_PER_TERM) {
      continue;
    }

    for (const entry of matches) {
      let score = scores.get(entry.server.name);
      if (!score) {
        score = {
          allTime: 0,
          thisWeek: 0,
          daily: dailyWindow ? dailyWindow.map(() => 0) : undefined,
        };
        scores.set(entry.server.name, score);
      }
      score.allTime += allTime;
      score.thisWeek += thisWeek;

      if (dailyWindow && score.daily && daily) {
        for (let i = 0; i < dailyWindow.length; i += 1) {
          score.daily[i] += daily[dailyWindow[i]] ?? 0;
        }
      }
    }
  }

  return scores;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { value: PopularityScores | null; expiresAt: number } | undefined;

/**
 * Popularity scores for the given registry entries, derived from recorded
 * search analytics. Returns null when analytics are unavailable.
 */
export async function getPopularityScores(
  entries: ServerEntry[],
): Promise<PopularityScores | null> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const stats = await getSearchStats();
  const value = stats ? computePopularityScores(entries, stats) : null;
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
