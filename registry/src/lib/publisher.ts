export type Publisher = {
  /** Human-readable label, e.g. "neon.com" or "github.com/octocat". */
  label: string;
  /** Best-effort link to the publisher, when one can be derived. */
  url?: string;
};

const GITHUB_PREFIX = "io.github.";

/**
 * Turns a reverse-DNS registry namespace into the real-world publisher.
 *
 * - `io.github.octocat` -> github.com/octocat (GitHub-verified namespaces)
 * - `com.neon` -> neon.com
 * - `app.linear` -> linear.app
 * - `com.googleapis.homegraph` -> homegraph.googleapis.com
 */
export function publisherFromNamespace(namespace: string): Publisher {
  const normalized = namespace.trim();

  if (normalized.startsWith(GITHUB_PREFIX)) {
    const account = normalized.slice(GITHUB_PREFIX.length);
    if (account) {
      return {
        label: `github.com/${account}`,
        url: `https://github.com/${account}`,
      };
    }
  }

  const segments = normalized.split(".").filter(Boolean);
  if (segments.length < 2) {
    return { label: normalized };
  }

  const domain = segments.reverse().join(".");
  return {
    label: domain,
    url: `https://${domain}`,
  };
}

/**
 * Display variant of a registry server name with the reverse-DNS namespace
 * replaced by the real-world publisher, e.g. `com.neon/mcp` -> `neon.com/mcp`
 * and `io.github.octocat/server` -> `github.com/octocat/server`.
 */
export function displayServerName(name: string): string {
  const [namespace, ...rest] = name.split("/");
  const publisher = publisherFromNamespace(namespace ?? "");
  return [publisher.label, ...rest].join("/");
}
