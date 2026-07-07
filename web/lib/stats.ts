const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export interface ProjectStats {
  /** e.g. "245" — null when the fetch failed at build time. */
  stars: string | null;
  /** e.g. "180k" — null when the fetch failed at build time. */
  weeklyDownloads: string | null;
}

/**
 * Fetched once per build (static output), so the numbers refresh on every
 * deploy. Failures degrade to plain links without counts instead of failing
 * the build — the GitHub API is unauthenticated and rate-limited per IP.
 */
export async function fetchProjectStats(): Promise<ProjectStats> {
  const [stars, weeklyDownloads] = await Promise.all([
    fetchStars(),
    fetchWeeklyDownloads(),
  ]);
  return { stars, weeklyDownloads };
}

async function fetchStars(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/neon-solutions/add-mcp");
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number"
      ? compact.format(data.stargazers_count)
      : null;
  } catch {
    return null;
  }
}

async function fetchWeeklyDownloads(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.npmjs.org/downloads/point/last-week/add-mcp",
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { downloads?: number };
    return typeof data.downloads === "number"
      ? compact.format(data.downloads)
      : null;
  } catch {
    return null;
  }
}
