/**
 * Optional base path this registry is served under (e.g. "/registry" when
 * hosted at add-mcp.com/registry). Empty by default so self-hosted registries
 * keep serving from the domain root. `NEXT_PUBLIC_` so the value is inlined
 * into client components at build time.
 */
export const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function normalizeBasePath(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

/** Prefixes a root-relative path with the configured base path. */
export function withBasePath(path: string): string {
  return `${basePath}${path}`;
}

/** Strips the configured base path from a request path, for analytics. */
export function stripBasePath(path: string): string {
  if (basePath && path.startsWith(basePath)) {
    const stripped = path.slice(basePath.length);
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
  }
  return path;
}
