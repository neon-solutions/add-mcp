import { unstable_cache } from "next/cache";

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export type ProjectStats = {
  stars: string | null;
  weeklyDownloads: string | null;
};

async function fetchProjectStats(): Promise<ProjectStats> {
  const [stars, weeklyDownloads] = await Promise.all([
    fetchStars(),
    fetchWeeklyDownloads(),
  ]);
  return { stars, weeklyDownloads };
}

async function fetchStars(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/neon-solutions/add-mcp",
      {
        next: { revalidate: 3600 },
      },
    );
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
      { next: { revalidate: 3600 } },
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

export const getProjectStats = unstable_cache(
  fetchProjectStats,
  ["add-mcp-project-stats"],
  { revalidate: 3600 },
);
