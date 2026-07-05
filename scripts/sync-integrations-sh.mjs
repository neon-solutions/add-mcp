#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_API_BASE = "https://integrations.sh";
const DEFAULT_OVERLAY_PATH = "registry.overlay.json";
const DEFAULT_OUT_PATH = "registry.json";
const DEFAULT_CONCURRENCY = 12;
const SERVER_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

function parseArgs(argv) {
  const options = {
    apiBase: DEFAULT_API_BASE,
    overlayPath: DEFAULT_OVERLAY_PATH,
    outPath: DEFAULT_OUT_PATH,
    concurrency: DEFAULT_CONCURRENCY,
    limit: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--api-base" && next) {
      options.apiBase = next;
      i++;
    } else if (arg === "--overlay" && next) {
      options.overlayPath = next;
      i++;
    } else if (arg === "--out" && next) {
      options.outPath = next;
      i++;
    } else if (arg === "--concurrency" && next) {
      options.concurrency = Number(next);
      i++;
    } else if (arg === "--limit" && next) {
      options.limit = Number(next);
      i++;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  ) {
    throw new Error("--limit must be a positive integer");
  }

  options.apiBase = options.apiBase.replace(/\/+$/, "");
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-integrations-sh.mjs [options]

Build add-mcp's MCP registry JSON file from integrations.sh surface data.

Options:
  --api-base <url>      integrations.sh API origin (default: ${DEFAULT_API_BASE})
  --overlay <path>      MCP registry entries to merge last (default: ${DEFAULT_OVERLAY_PATH})
  --out <path>          Output registry path (default: ${DEFAULT_OUT_PATH})
  --concurrency <n>     Concurrent /surface fetches (default: ${DEFAULT_CONCURRENCY})
  --limit <n>           Limit domains, useful for local debugging
`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "add-mcp-registry-sync",
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  return response.json();
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}...`;
}

function isValidHttpsUrl(value) {
  if (typeof value !== "string" || /[<>]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasCredentialQuery(value) {
  const url = new URL(value);
  for (const [key, rawValue] of url.searchParams.entries()) {
    const queryValue = rawValue.trim();
    if (/^(auth|k|key|token|secret|subscription-key|api[-_]?key)$/i.test(key)) {
      return true;
    }
    if (/^[a-z0-9._-]{32,}$/i.test(queryValue)) {
      return true;
    }
  }
  return false;
}

function reverseDomain(domain) {
  return domain
    .toLowerCase()
    .split(".")
    .filter(Boolean)
    .reverse()
    .map((part) => part.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join(".");
}

function slugify(value, fallback = "mcp") {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return slug || fallback;
}

function titleFromSurface(surface, domain) {
  const cleaned = normalizeText(surface.name)
    .replace(/\bmodel context protocol\b/gi, "MCP")
    .replace(/\s*\((remote|local[^)]*)\)/gi, "")
    .replace(/\bremote\s+mcp\s+server\b/gi, "")
    .replace(/\bmcp\b/gi, "")
    .replace(/\bserver\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–—]\s*$/g, "")
    .trim();
  if (cleaned.length > 1) return cleaned;
  const [label] = domain.split(".");
  return label
    ? label.charAt(0).toUpperCase() + label.slice(1)
    : normalizeText(surface.name) || "MCP Server";
}

function transportType(surface) {
  const transports = Array.isArray(surface.transports)
    ? surface.transports
    : [];
  if (transports.some((transport) => transport === "sse")) return "sse";
  return "streamable-http";
}

function placeholdersFromUrl(url) {
  const placeholders = new Set();
  for (const match of url.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1]?.trim();
    if (name) placeholders.add(name);
  }
  return placeholders;
}

function remoteVariables(surface) {
  const placeholders = placeholdersFromUrl(surface.url);
  const variables = new Map();

  for (const variable of Array.isArray(surface.variables)
    ? surface.variables
    : []) {
    if (!variable?.name) continue;
    variables.set(variable.name, {
      description: variable.description || variable.resolveFrom,
      isRequired: placeholders.has(variable.name) || variable.in === "url",
    });
  }

  for (const placeholder of placeholders) {
    if (!variables.has(placeholder)) {
      variables.set(placeholder, {
        description: `Value for {${placeholder}}.`,
        isRequired: true,
      });
    }
  }

  return variables.size > 0 ? Object.fromEntries(variables) : undefined;
}

function authHeaders(surface, credentials) {
  const headers = new Map();

  for (const header of Array.isArray(surface.requiredHeaders)
    ? surface.requiredHeaders
    : []) {
    if (!header?.name) continue;
    headers.set(header.name, {
      name: header.name,
      description: header.description,
      isRequired: true,
      isSecret: header.source?.kind === "env",
    });
  }

  if (surface.auth?.status !== "required") {
    return headers.size > 0 ? [...headers.values()] : undefined;
  }

  for (const entry of Array.isArray(surface.auth.entries)
    ? surface.auth.entries
    : []) {
    for (const use of Array.isArray(entry.use) ? entry.use : []) {
      const mechanics = use?.mechanics;
      if (
        mechanics?.source !== "http" ||
        (mechanics.in && mechanics.in !== "header") ||
        !mechanics.headerName
      ) {
        continue;
      }
      const credential = credentials?.[use.id];
      const label = credential?.label || use.id || mechanics.headerName;
      const scheme = mechanics.scheme ? `${mechanics.scheme} ` : "";
      headers.set(mechanics.headerName, {
        name: mechanics.headerName,
        description: `${label}. Use ${scheme}<token>.`,
        isRequired: true,
        isSecret: true,
      });
    }
  }

  return headers.size > 0 ? [...headers.values()] : undefined;
}

function remoteForSurface(surface, credentials) {
  if (!isValidHttpsUrl(surface.url) || hasCredentialQuery(surface.url)) {
    return null;
  }

  const variables = remoteVariables(surface);
  const headers = authHeaders(surface, credentials);

  return {
    type: transportType(surface),
    url: surface.url,
    ...(variables ? { variables } : {}),
    ...(headers ? { headers } : {}),
  };
}

function entryForSurface(doc, surface, installableCount, apiBase) {
  const remote = remoteForSurface(surface, doc.credentials);
  if (!remote) return null;

  const title = titleFromSurface(surface, doc.domain);
  const nameSuffix =
    installableCount === 1 ? "mcp" : slugify(surface.slug || surface.name);
  const serverName = `${reverseDomain(doc.domain)}/${nameSuffix}`;
  const description =
    doc.description ||
    doc.summary ||
    `${title} MCP server discovered by integrations.sh.`;
  const surfacePage = `${apiBase}/${encodeURIComponent(doc.domain)}/${encodeURIComponent(surface.slug || "mcp")}/`;

  return {
    server: {
      $schema: SERVER_SCHEMA,
      name: serverName,
      title,
      description: truncate(description, 500),
      version: "1.0.0",
      websiteUrl: isValidHttpsUrl(surface.docs) ? surface.docs : surfacePage,
      icons: [
        {
          src: `${apiBase}/logo/${encodeURIComponent(doc.domain)}`,
        },
      ],
      remotes: [remote],
    },
  };
}

async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function readOverlay(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Overlay must be an array: ${filePath}`);
  }
  return parsed;
}

function mergeEntries(generated, overlay) {
  const byName = new Map();
  for (const entry of generated) {
    if (entry?.server?.name) byName.set(entry.server.name, entry);
  }
  for (const entry of overlay) {
    if (entry?.server?.name) byName.set(entry.server.name, entry);
  }
  return [...byName.values()].sort((a, b) => {
    const titleDiff = (a.server.title || "").localeCompare(
      b.server.title || "",
      undefined,
      { sensitivity: "base" },
    );
    if (titleDiff !== 0) return titleDiff;
    return (a.server.name || "").localeCompare(b.server.name || "", undefined, {
      sensitivity: "base",
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = await fetchJson(`${options.apiBase}/api.json`);
  const mcpDomains = [
    ...new Set(
      (catalog.data || [])
        .filter((item) => item?.kind === "mcp" && item?.domain)
        .map((item) => item.domain),
    ),
  ].slice(0, options.limit);

  let failed = 0;
  let skipped = 0;
  const generatedGroups = await mapConcurrent(
    mcpDomains,
    options.concurrency,
    async (domain) => {
      try {
        const doc = await fetchJson(
          `${options.apiBase}/api/${encodeURIComponent(domain)}/surface`,
        );
        const installable = (doc.surfaces || []).filter(
          (surface) =>
            surface?.type === "mcp" &&
            typeof surface.url === "string" &&
            surface.url.startsWith("https://"),
        );
        if (installable.length === 0) {
          skipped++;
          return [];
        }
        return installable
          .map((surface) =>
            entryForSurface(doc, surface, installable.length, options.apiBase),
          )
          .filter(Boolean);
      } catch (error) {
        failed++;
        console.warn(
          `Skipping ${domain}: ${error instanceof Error ? error.message : error}`,
        );
        return [];
      }
    },
  );

  const generated = generatedGroups.flat();
  const overlay = await readOverlay(options.overlayPath);
  const merged = mergeEntries(generated, overlay);

  await mkdir(path.dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(
    `Wrote ${merged.length} servers to ${options.outPath} (${generated.length} integrations.sh, ${overlay.length} overlay, ${skipped} skipped, ${failed} failed).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
