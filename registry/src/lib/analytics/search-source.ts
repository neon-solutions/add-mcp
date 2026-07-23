export const SEARCH_SOURCES = ["api", "cli", "web"] as const;

export type SearchSource = (typeof SEARCH_SOURCES)[number];

/**
 * Only the add-mcp CLI may self-identify through the public listing endpoint.
 * Website searches are assigned by the dedicated same-origin event endpoint.
 */
export function apiSearchSource(value: string | undefined): SearchSource {
  return value === "cli" ? "cli" : "api";
}
