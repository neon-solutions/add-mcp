export type SiteConfig = {
  /** Display name of the registry. */
  name: string;
  /** Short description shown in the hero and page metadata. */
  description: string;
  /** Link to the source repository. */
  repositoryUrl: string;
  /**
   * Custom image URL for the header logo. `null` renders the built-in
   * monochrome mark, which follows the active theme.
   */
  logoUrl: string | null;
};

// The registry is the API & UI behind add-mcp.com/registry — branding is baked
// in rather than configured.
const SITE_CONFIG: SiteConfig = {
  name: "add-mcp registry",
  description:
    "Registry for the add-mcp CLI — a cached snapshot of the integrations.sh MCP servers, ranked by searches.",
  repositoryUrl: "https://github.com/neon-solutions/add-mcp",
  logoUrl: null,
};

export function getSiteConfig(): SiteConfig {
  return SITE_CONFIG;
}
