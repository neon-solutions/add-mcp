import * as p from "@clack/prompts";
import {
  DEFAULT_FIND_REGISTRY_LABEL,
  DEFAULT_FIND_REGISTRY_URL,
} from "./config.js";
import type { SourceType, TransportType } from "./types.js";
import {
  type PackageArgPrompt,
  type RegistryPackageArgumentDefinition,
  buildPackageArgumentsArgvInteractive,
  buildPackageArgumentsArgvNonInteractive,
  definitionsFromPackage,
} from "./package-arguments.js";

export type { RegistryPackageArgumentDefinition } from "./package-arguments.js";

export type RegistryRemoteTransport = "streamable-http" | "sse";

export interface RegistryVariableDefinition {
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
  choices?: string[];
}

export interface RegistryHeaderDefinition {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

export interface RegistryRemoteDefinition {
  type: RegistryRemoteTransport;
  url: string;
  variables?: Record<string, RegistryVariableDefinition>;
  headers?: RegistryHeaderDefinition[];
}

export interface RegistryPackageDefinition {
  registryType: "npm" | "pypi" | "oci" | "nuget" | "mcpb";
  identifier: string;
  version?: string;
  runtimeHint?: string;
  /** Arguments passed to the package runtime before the package identifier. */
  runtimeArguments?: RegistryPackageArgumentDefinition[];
  environmentVariables?: RegistryNamedVariableDefinition[];
  headers?: RegistryHeaderDefinition[];
  /** MCP registry / server.json package CLI arguments (positional vs named). */
  packageArguments?: RegistryPackageArgumentDefinition[];
  transport: {
    type: "stdio";
  };
}

export interface RegistryNamedVariableDefinition extends RegistryVariableDefinition {
  name: string;
}

export interface RegistryServerEntry {
  name: string;
  title?: string;
  description: string;
  version: string;
  repositoryUrl?: string;
  remotes?: RegistryRemoteDefinition[];
  package?: RegistryPackageDefinition;
}

export interface FindCommandOptions {
  yes?: boolean;
  registries?: FindRegistrySearchConfig[];
  preferredTransport?: TransportType;
}

export interface FindInstallPlan {
  target: string;
  sourceType?: SourceType;
  serverName: string;
  transport?: TransportType;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  args?: string[];
}

export interface PromptField {
  key: string;
  label: string;
  isRequired: boolean;
  placeholder: string;
}

export interface FindRegistrySearchConfig {
  url: string;
  label?: string;
}

export interface FailedRegistryInfo {
  registry: FindRegistrySearchConfig;
  detail: string;
}

export interface RegistrySearchResult {
  entries: RegistryServerEntry[];
  failedRegistries: FailedRegistryInfo[];
}

export function buildPlaceholderValue(kind: "header" | "variable"): string {
  return kind === "header"
    ? "<your-header-value-here>"
    : "<your-variable-value-here>";
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0);
}

const TRUSTED_NAMESPACE_PREFIXES = [
  "com.supabase/",
  "io.github.github/",
  "com.postman/",
  "com.stripe/",
  "com.vercel/",
  "io.github.vercel/",
  "com.notion/",
  "app.linear/",
  "com.atlassian/",
  "com.cloudflare.",
  "io.github.getsentry/",
  "io.github.mongodb-js/",
  "io.github.railwayapp/",
];

const NOISY_NAMESPACE_PREFIXES = ["ai.smithery/"];
const SMITHERY_PREFIX = "ai.smithery/";

export function resolveTemplateUrl(
  templateUrl: string,
  values: Record<string, string>,
): string {
  return templateUrl.replace(/\{([^}]+)\}/g, (fullMatch, rawName: string) => {
    const key = String(rawName);
    const replacement = values[key];
    return replacement && replacement.length > 0 ? replacement : fullMatch;
  });
}

function rankRegistryEntry(query: string, entry: RegistryServerEntry): number {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(normalizedQuery);
  const name = normalize(entry.name);
  const title = normalize(entry.title ?? "");
  const description = normalize(entry.description);
  const haystack = `${name} ${title} ${description}`;
  const haystackTokens = new Set(tokenize(haystack));

  let score = 0;

  // Strong lexical relevance scoring.
  if (name === normalizedQuery) score += 800;
  if (name.includes(normalizedQuery)) score += 350;
  if (title.includes(normalizedQuery)) score += 250;
  if (description.includes(normalizedQuery)) score += 120;

  for (const token of queryTokens) {
    if (token.length === 0) continue;
    if (haystackTokens.has(token)) {
      score += 60;
    } else if (token.length >= 3 && haystack.includes(token)) {
      score += 20;
    }
  }

  // Prefer likely official/vendor namespaces.
  if (TRUSTED_NAMESPACE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    score += 500;
  }

  // Demote noisy aggregators, but keep as fallback.
  if (NOISY_NAMESPACE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    score -= 500;
  }

  return score;
}

export function rankRegistryEntries(
  query: string,
  entries: RegistryServerEntry[],
): RegistryServerEntry[] {
  return [...entries].sort((a, b) => {
    const scoreDiff = rankRegistryEntry(query, b) - rankRegistryEntry(query, a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });
}

function isSmitheryEntry(entry: RegistryServerEntry): boolean {
  return normalize(entry.name).startsWith(SMITHERY_PREFIX);
}

export function filterSmitheryWhenAlternativesExist(
  entries: RegistryServerEntry[],
): RegistryServerEntry[] {
  if (entries.length === 0) return entries;
  const hasNonSmithery = entries.some((entry) => !isSmitheryEntry(entry));
  if (!hasNonSmithery) return entries;
  return entries.filter((entry) => !isSmitheryEntry(entry));
}

interface RegistryServerListResponse {
  servers?: RegistryServerListItem[];
}

const OFFICIAL_REGISTRY_BASE_URL = "https://registry.modelcontextprotocol.io";

export function resolveOfficialRegistryServersUrl(): string {
  return `${OFFICIAL_REGISTRY_BASE_URL}/v0.1/servers`;
}

export function getDefaultFindRegistries(): FindRegistrySearchConfig[] {
  return [
    {
      url: DEFAULT_FIND_REGISTRY_URL,
      label: DEFAULT_FIND_REGISTRY_LABEL,
    },
    {
      url: resolveOfficialRegistryServersUrl(),
      label: "Official Anthropic registry",
    },
  ];
}

export function formatRegistryFailure(failure: FailedRegistryInfo): string {
  const { registry, detail } = failure;
  const defaults = getDefaultFindRegistries();
  const isKnown = defaults.some((d) => d.url === registry.url);
  if (isKnown && registry.label) {
    return `"${registry.label}" (${registry.url}) is unavailable — ${detail}`;
  }
  return `Registry ${registry.url} is unavailable — ${detail}`;
}

interface RegistryServerListItem {
  server?: {
    name?: string;
    title?: string;
    description?: string;
    version?: string;
    repository?: {
      url?: string;
      source?: string;
    };
    remotes?: RegistryRemoteDefinition[];
    packages?: RegistryPackageDefinition[];
  };
}

function toEntry(item: RegistryServerListItem): RegistryServerEntry | null {
  const server = item?.server;
  if (!server?.name || !server?.description || !server?.version) {
    return null;
  }

  const packages = server.packages ?? [];
  const npmPackage = packages.find((pkg) => pkg.registryType === "npm");
  const pypiPackage = packages.find(
    (pkg) =>
      pkg.registryType === "pypi" &&
      (!pkg.runtimeHint || pkg.runtimeHint.trim().toLowerCase() === "uvx"),
  );
  const installablePackage = npmPackage ?? pypiPackage;

  const hasRemotes = Array.isArray(server.remotes) && server.remotes.length > 0;
  if (!installablePackage && !hasRemotes) {
    return null;
  }

  return {
    name: server.name,
    title: server.title,
    description: server.description,
    version: server.version,
    repositoryUrl: server.repository?.url,
    remotes: server.remotes,
    package: installablePackage,
  };
}

function buildRegistryRequestUrl(registryUrl: string, query: string): string {
  const params = new URLSearchParams({
    version: "latest",
    limit: "100",
  });
  if (query.length > 0) {
    params.set("search", query);
    params.set("source", "cli");
  }
  const url = new URL(registryUrl);
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function searchRegistry(
  query: string,
  registries: FindRegistrySearchConfig[],
): Promise<RegistrySearchResult> {
  const trimmedQuery = normalize(query);

  const deduped = new Map<string, RegistryServerEntry>();
  const failedRegistries: FailedRegistryInfo[] = [];

  for (const registry of registries) {
    try {
      const requestUrl = buildRegistryRequestUrl(registry.url, trimmedQuery);
      const response = await fetch(requestUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as RegistryServerListResponse;
      for (const item of payload.servers ?? []) {
        const entry = toEntry(item);
        if (!entry) continue;
        const key = `${entry.name}@${entry.version}`;
        if (!deduped.has(key)) {
          deduped.set(key, entry);
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      failedRegistries.push({ registry, detail });
    }
  }

  return {
    entries: [...deduped.values()],
    failedRegistries,
  };
}

export function resolveServerName(entry: RegistryServerEntry): string {
  const title = entry.title?.trim();
  if (title && title.length > 0) {
    return title.toLowerCase();
  }

  const cleaned = entry.name
    .toLowerCase()
    .replace(/mcp/g, "")
    .replace(/com/g, "");
  const tokens = cleaned
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0);
  if (tokens.length > 0) {
    return tokens.join("-");
  }

  const fallback = entry.name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0)
    .join("-");
  return fallback || "server";
}

function remoteToTransport(
  type: RegistryRemoteDefinition["type"],
): TransportType {
  return type === "sse" ? "sse" : "http";
}

function pickRemote(
  entry: RegistryServerEntry,
  preferredTransport?: TransportType,
): RegistryRemoteDefinition | null {
  const remotes = entry.remotes ?? [];
  if (remotes.length === 0) return null;
  const preferred =
    preferredTransport === "sse"
      ? remotes.find((remote) => remote.type === "sse")
      : remotes.find((remote) => remote.type === "streamable-http");
  return preferred ?? remotes[0] ?? null;
}

function formatPackageTarget(pkg: RegistryPackageDefinition): string {
  return pkg.identifier;
}

interface PackageSource {
  target: string;
  sourceType?: SourceType;
  args: string[];
}

function buildPackageSource(
  pkg: RegistryPackageDefinition,
  runtimeArgv: string[],
): PackageSource {
  if (pkg.registryType !== "pypi") {
    return { target: pkg.identifier, args: [] };
  }

  const version = pkg.version?.trim();
  const packageSpecifier = version
    ? `${pkg.identifier}@${version}`
    : pkg.identifier;
  return {
    target: "uvx",
    sourceType: "command",
    args: [...runtimeArgv, packageSpecifier],
  };
}

function transportLabel(entry: RegistryServerEntry): string {
  const parts: string[] = [];
  if (entry.package) parts.push("stdio");
  if (entry.remotes && entry.remotes.length > 0) parts.push("remote");
  return parts.length > 0 ? parts.join(", ") : "unknown";
}

function formatRemoteTarget(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "");
}

function formatFindResultTarget(entry: RegistryServerEntry): string {
  const remote = pickRemote(entry);
  if (remote) {
    return formatRemoteTarget(remote.url);
  }
  if (entry.package) {
    return formatPackageTarget(entry.package);
  }
  return entry.name;
}

export function formatFindResultRow(entry: RegistryServerEntry): string {
  const display = entry.title ?? entry.name;
  return `${display} (${formatFindResultTarget(entry)}) [${transportLabel(entry)}]`;
}

async function promptValue(field: PromptField): Promise<string | symbol> {
  return p.text({
    message: `${field.label} ${field.isRequired ? "(required)" : "(optional)"}`,
    placeholder: field.placeholder,
  });
}

export async function collectPromptValues(
  fields: PromptField[],
  ask: (field: PromptField) => Promise<string | symbol>,
): Promise<{ values: Record<string, string>; cancelled: boolean }> {
  const values: Record<string, string> = {};

  for (const field of fields) {
    const raw = await ask(field);
    if (p.isCancel(raw)) {
      return { values, cancelled: true };
    }

    const value = raw != null && typeof raw === "string" ? raw.trim() : "";

    if (value.length > 0) {
      values[field.key] = value;
    } else if (field.isRequired) {
      values[field.key] = field.placeholder;
    }
  }

  return { values, cancelled: false };
}

function variableFields(
  variables: Record<string, RegistryVariableDefinition> | undefined,
): PromptField[] {
  if (!variables) return [];
  return Object.entries(variables).map(([key, definition]) => ({
    key,
    label: `Variable ${key}`,
    isRequired: definition.isRequired === true,
    placeholder: buildPlaceholderValue("variable"),
  }));
}

function headerFields(
  headers: RegistryHeaderDefinition[] | undefined,
): PromptField[] {
  if (!headers) return [];
  return headers.map((header) => ({
    key: header.name,
    label: `Header ${header.name}`,
    isRequired: header.isRequired === true,
    placeholder: buildPlaceholderValue("header"),
  }));
}

function packageVariableFields(
  variables: RegistryNamedVariableDefinition[] | undefined,
): PromptField[] {
  if (!variables) return [];
  return variables
    .filter((variable) => variable.name && variable.name.trim().length > 0)
    .map((variable) => ({
      key: variable.name,
      label: `Environment variable ${variable.name}`,
      isRequired: variable.isRequired === true,
      placeholder: buildPlaceholderValue("variable"),
    }));
}

function resolveNonInteractiveRemote(remote: RegistryRemoteDefinition): {
  url: string;
  headers?: Record<string, string>;
} {
  const variableValues: Record<string, string> = {};
  for (const [key, def] of Object.entries(remote.variables ?? {})) {
    if (def.isRequired) {
      variableValues[key] = buildPlaceholderValue("variable");
    }
  }

  const headerValues: Record<string, string> = {};
  for (const header of remote.headers ?? []) {
    if (header.isRequired) {
      headerValues[header.name] = buildPlaceholderValue("header");
    }
  }

  return {
    url: resolveTemplateUrl(remote.url, variableValues),
    headers: Object.keys(headerValues).length > 0 ? headerValues : undefined,
  };
}

async function resolveInteractiveRemote(
  remote: RegistryRemoteDefinition,
): Promise<{ url: string; headers?: Record<string, string> } | null> {
  const variableResult = await collectPromptValues(
    variableFields(remote.variables),
    promptValue,
  );
  if (variableResult.cancelled) return null;

  const headerResult = await collectPromptValues(
    headerFields(remote.headers),
    promptValue,
  );
  if (headerResult.cancelled) return null;

  return {
    url: resolveTemplateUrl(remote.url, variableResult.values),
    headers:
      Object.keys(headerResult.values).length > 0
        ? headerResult.values
        : undefined,
  };
}

function resolveNonInteractivePackage(pkg: RegistryPackageDefinition): {
  target: string;
  sourceType?: SourceType;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  args?: string[];
} {
  const env: Record<string, string> = {};
  for (const field of packageVariableFields(pkg.environmentVariables)) {
    if (field.isRequired) {
      env[field.key] = field.placeholder;
    }
  }

  const headers: Record<string, string> = {};
  for (const field of headerFields(pkg.headers)) {
    if (field.isRequired) {
      headers[field.key] = field.placeholder;
    }
  }

  const runtimeArgv = buildPackageArgumentsArgvNonInteractive(
    pkg.registryType === "pypi" ? (pkg.runtimeArguments ?? []) : [],
    buildPlaceholderValue("variable"),
  );
  const packageArgv = buildPackageArgumentsArgvNonInteractive(
    definitionsFromPackage(pkg),
    buildPlaceholderValue("variable"),
  );
  const source = buildPackageSource(pkg, runtimeArgv);
  const args = [...source.args, ...packageArgv];

  return {
    target: source.target,
    sourceType: source.sourceType,
    env: Object.keys(env).length > 0 ? env : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    args: args.length > 0 ? args : undefined,
  };
}

async function resolveInteractivePackage(
  pkg: RegistryPackageDefinition,
): Promise<{
  target: string;
  sourceType?: SourceType;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  args?: string[];
} | null> {
  const promptPackageArg: PackageArgPrompt = async (info) =>
    p.text({
      message: `${info.label} ${info.isRequired ? "(required)" : "(optional)"}`,
      placeholder: info.placeholder,
    });

  const envResult = await collectPromptValues(
    packageVariableFields(pkg.environmentVariables),
    promptValue,
  );
  if (envResult.cancelled) return null;

  const headerResult = await collectPromptValues(
    headerFields(pkg.headers),
    promptValue,
  );
  if (headerResult.cancelled) return null;

  const runtimeArgvResult = await buildPackageArgumentsArgvInteractive(
    pkg.registryType === "pypi" ? (pkg.runtimeArguments ?? []) : [],
    promptPackageArg,
  );
  if (runtimeArgvResult.cancelled) return null;

  const packageArgvResult = await buildPackageArgumentsArgvInteractive(
    definitionsFromPackage(pkg),
    promptPackageArg,
  );
  if (packageArgvResult.cancelled) return null;
  const source = buildPackageSource(pkg, runtimeArgvResult.argv);
  const args = [...source.args, ...packageArgvResult.argv];

  return {
    target: source.target,
    sourceType: source.sourceType,
    env:
      Object.keys(envResult.values).length > 0 ? envResult.values : undefined,
    headers:
      Object.keys(headerResult.values).length > 0
        ? headerResult.values
        : undefined,
    args: args.length > 0 ? args : undefined,
  };
}

export async function buildInstallPlanForEntry(
  entry: RegistryServerEntry,
  options: FindCommandOptions,
): Promise<FindInstallPlan | null> {
  const remote = pickRemote(entry, options.preferredTransport);
  const pkg = entry.package ?? null;
  const hasRemote = remote !== null;
  const hasPackage = pkg !== null;

  if (!hasRemote && !hasPackage) {
    return null;
  }

  let mode: "remote" | "package";
  if (hasRemote && hasPackage) {
    if (options.yes) {
      mode = "remote";
    } else {
      const selected = await p.select({
        message: `Install mode for ${entry.name}`,
        initialValue: "remote",
        options: [
          { value: "remote", label: "Remote", hint: "Recommended default" },
          {
            value: "package",
            label: "Stdio package",
            hint: "Local stdio package",
          },
        ],
      });
      if (p.isCancel(selected)) return null;
      mode = selected as "remote" | "package";
    }
  } else {
    mode = hasRemote ? "remote" : "package";
  }

  if (mode === "package" && pkg) {
    const resolved = options.yes
      ? resolveNonInteractivePackage(pkg)
      : await resolveInteractivePackage(pkg);
    if (!resolved) return null;

    return {
      target: resolved.target,
      sourceType: resolved.sourceType,
      serverName: resolveServerName(entry),
      env: resolved.env,
      headers: resolved.headers,
      args: resolved.args,
    };
  }

  if (!remote) return null;
  const resolved = options.yes
    ? resolveNonInteractiveRemote(remote)
    : await resolveInteractiveRemote(remote);
  if (!resolved) return null;

  return {
    target: resolved.url,
    serverName: resolveServerName(entry),
    transport: remoteToTransport(remote.type),
    headers: resolved.headers,
  };
}

async function offerFallbackSearch(
  query: string,
  alreadyQueried: FindRegistrySearchConfig[],
): Promise<RegistryServerEntry[] | null> {
  const defaults = getDefaultFindRegistries();
  const queriedUrls = new Set(alreadyQueried.map((r) => r.url));
  const candidates = defaults.filter((r) => !queriedUrls.has(r.url));

  if (candidates.length === 0) {
    return null;
  }

  let selectedRegistries: FindRegistrySearchConfig[];

  if (candidates.length === 1) {
    const candidate = candidates[0]!;
    const confirmed = await p.confirm({
      message: `Search "${candidate.label ?? candidate.url}" (${candidate.url}) instead?`,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      return null;
    }
    selectedRegistries = [candidate];
  } else {
    const selected = await p.multiselect({
      message: "Search other registries instead?",
      options: candidates.map((r) => ({
        value: r.url,
        label: r.label ?? r.url,
      })),
      required: true,
    });
    if (p.isCancel(selected)) {
      return null;
    }
    selectedRegistries = candidates.filter((r) =>
      (selected as string[]).includes(r.url),
    );
  }

  const fallbackResult = await searchRegistry(query, selectedRegistries);

  if (fallbackResult.failedRegistries.length > 0) {
    for (const failure of fallbackResult.failedRegistries) {
      p.log.error(formatRegistryFailure(failure));
    }
  }

  if (fallbackResult.entries.length === 0) {
    if (fallbackResult.failedRegistries.length === 0) {
      p.log.warn(`No MCP servers found for "${query}"`);
    }
    return null;
  }

  return fallbackResult.entries;
}

const FIND_PAGE_SIZE = 15;
const LOAD_MORE_SENTINEL = "__load_more__";

async function selectEntryWithPagination(
  visibleEntries: RegistryServerEntry[],
  message: string,
): Promise<RegistryServerEntry | null> {
  let page = 0;

  while (true) {
    const start = page * FIND_PAGE_SIZE;
    const slice = visibleEntries.slice(start, start + FIND_PAGE_SIZE);
    const hasMore = visibleEntries.length > start + FIND_PAGE_SIZE;
    const remaining = visibleEntries.length - (start + FIND_PAGE_SIZE);

    const options: { value: string; label: string; hint?: string }[] =
      slice.map((entryOption) => ({
        value: entryOption.name,
        label: formatFindResultRow(entryOption),
        hint: entryOption.description,
      }));

    if (hasMore) {
      options.push({
        value: LOAD_MORE_SENTINEL,
        label: `▼ Show more results (${remaining} remaining)`,
      });
    }

    const selected = await p.select({ message, options });
    if (p.isCancel(selected)) return null;
    if (selected === LOAD_MORE_SENTINEL) {
      page++;
      continue;
    }
    return visibleEntries.find((e) => e.name === selected) ?? null;
  }
}

export async function runFind(
  query: string,
  options: FindCommandOptions,
): Promise<FindInstallPlan | null> {
  const registries =
    options.registries && options.registries.length > 0
      ? options.registries
      : [
          {
            url: resolveOfficialRegistryServersUrl(),
            label: "Official Anthropic registry",
          },
        ];

  const isBrowseMode = query.trim().length === 0;

  const result = await searchRegistry(query, registries);
  let entries = result.entries;
  const { failedRegistries } = result;

  if (failedRegistries.length > 0 && entries.length > 0) {
    for (const failure of failedRegistries) {
      p.log.warn(formatRegistryFailure(failure));
    }
  }

  if (entries.length === 0 && failedRegistries.length > 0) {
    for (const failure of failedRegistries) {
      p.log.error(formatRegistryFailure(failure));
    }

    if (!options.yes && !isBrowseMode) {
      const fallbackEntries = await offerFallbackSearch(query, registries);
      if (fallbackEntries) {
        entries = fallbackEntries;
      }
    }
  }

  if (entries.length === 0) {
    if (failedRegistries.length === 0) {
      p.log.warn(
        isBrowseMode
          ? "No MCP servers found in the configured registries"
          : `No MCP servers found for "${query}"`,
      );
    }
    return null;
  }

  const visibleEntries = isBrowseMode
    ? filterSmitheryWhenAlternativesExist(entries)
    : filterSmitheryWhenAlternativesExist(rankRegistryEntries(query, entries));

  const count = visibleEntries.length;
  const message = isBrowseMode
    ? "Browse MCP servers"
    : `Found ${count} server${count === 1 ? "" : "s"} for "${query}" — pick one`;

  const entry: RegistryServerEntry | null = options.yes
    ? (visibleEntries[0] ?? null)
    : await selectEntryWithPagination(visibleEntries, message);

  if (!entry) {
    return null;
  }

  return buildInstallPlanForEntry(entry, options);
}
