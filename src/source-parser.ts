import type { ParsedSource, SourceType } from "./types.js";

function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

/**
 * Detect filesystem-path-like inputs (absolute, home-relative, dot-relative,
 * or Windows drive paths). When the user passes a single path as the target —
 * even one containing spaces like "/Applications/My App/bin/server" — we treat
 * the entire string as a single command binary and never split it into
 * command+args. Callers that want args should use the repeatable --args flag.
 */
export function looksLikePath(input: string): boolean {
  if (input.startsWith("/")) return true;
  if (input.startsWith("~/") || input === "~") return true;
  if (input.startsWith("./") || input.startsWith("../")) return true;
  if (/^[A-Za-z]:[\\/]/.test(input)) return true;
  return false;
}

function isCommand(input: string): boolean {
  if (looksLikePath(input)) {
    return true;
  }
  if (input.includes(" ")) {
    return true;
  }
  if (
    input.startsWith("npx ") ||
    input.startsWith("node ") ||
    input.startsWith("python ")
  ) {
    return true;
  }
  return false;
}

function isPackageName(input: string): boolean {
  // Scoped package
  if (input.startsWith("@") && input.includes("/")) {
    return true;
  }
  // Simple package name
  if (/^[a-z0-9][\w.-]*(@[\w.-]+)?$/i.test(input)) {
    return true;
  }
  return false;
}

const commonTlds = new Set([
  "com",
  "org",
  "net",
  "io",
  "dev",
  "ai",
  "tech",
  "co",
  "app",
  "cloud",
  "sh",
  "run",
]);

/**
 * Examples:
 *   "mcp.neon.tech" -> "neon"
 *   "workos.com" -> "workos"
 *   "api.example.io" -> "example"
 */
function extractBrandFromHostname(hostname: string): string {
  const parts = hostname.split(".");

  const meaningfulParts = parts.filter((part) => {
    const lower = part.toLowerCase();
    if (commonTlds.has(lower)) return false;
    if (lower === "mcp" || lower === "api" || lower === "www") return false;
    return true;
  });

  if (meaningfulParts.length > 0) {
    return meaningfulParts[0]!;
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2]!;
  }

  return "mcp-server";
}

function inferName(input: string, type: SourceType): string {
  if (type === "remote") {
    try {
      const url = new URL(input);
      return extractBrandFromHostname(url.hostname);
    } catch {
      return "mcp-server";
    }
  }

  if (type === "command") {
    if (looksLikePath(input)) {
      const segments = input.split(/[\\/]/);
      const base = segments[segments.length - 1] || "mcp-server";
      const withoutExt = base.replace(/\.[^.]+$/, "");
      return extractPackageName(withoutExt || base);
    }

    const parts = input.split(" ");

    let startIndex = 0;
    if (parts[0] === "npx" || parts[0] === "node" || parts[0] === "python") {
      startIndex = 1;
    }

    for (let i = startIndex; i < parts.length; i++) {
      const part = parts[i];
      if (part && !part.startsWith("-")) {
        return extractPackageName(part);
      }
    }
    return "mcp-server";
  }

  return extractPackageName(input);
}

/**
 * Examples:
 *   "@modelcontextprotocol/server-postgres" -> "postgres"
 *   "mcp-server-github@1.0.0" -> "github"
 */
function extractPackageName(input: string): string {
  let name = input;

  // Strip version suffix (handle both pkg@version and @org/pkg@version)
  const atIndex = name.lastIndexOf("@");
  if (atIndex > 0 && !name.startsWith("@")) {
    name = name.slice(0, atIndex);
  } else if (name.startsWith("@") && name.indexOf("@", 1) > 0) {
    const secondAt = name.indexOf("@", 1);
    name = name.slice(0, secondAt);
  }

  // Extract package name from scoped packages
  if (name.startsWith("@") && name.includes("/")) {
    const parts = name.split("/");
    name = parts[1] || name;
  }

  // Strip common prefixes/suffixes
  name = name.replace(/^mcp-server-/, "");
  name = name.replace(/^server-/, "");
  name = name.replace(/-mcp$/, "");

  return name || "mcp-server";
}

export function parseSource(input: string): ParsedSource {
  const trimmed = input.trim();

  if (isUrl(trimmed)) {
    return {
      type: "remote",
      value: trimmed,
      inferredName: inferName(trimmed, "remote"),
    };
  }

  if (isCommand(trimmed)) {
    return {
      type: "command",
      value: trimmed,
      inferredName: inferName(trimmed, "command"),
    };
  }

  if (isPackageName(trimmed)) {
    return {
      type: "package",
      value: trimmed,
      inferredName: inferName(trimmed, "package"),
    };
  }

  // Default to treating it as a package name
  return {
    type: "package",
    value: trimmed,
    inferredName: inferName(trimmed, "package"),
  };
}

export function isRemoteSource(parsed: ParsedSource): boolean {
  return parsed.type === "remote";
}

export function isLocalSource(parsed: ParsedSource): boolean {
  return parsed.type === "package" || parsed.type === "command";
}
