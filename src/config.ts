import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

const CONFIG_DIR = "add-mcp";
const CONFIG_FILE = "config.json";
const CURRENT_VERSION = 1;

const LEGACY_AGENTS_DIR = ".agents";
const LEGACY_LOCK_FILE = ".mcp-lock.json";

export interface FindRegistryConfigEntry {
  url: string;
  label?: string;
}

export const DEFAULT_FIND_REGISTRY_URL =
  "https://add-mcp.com/registry/api/v1/servers";
export const DEFAULT_FIND_REGISTRY_LABEL = "add-mcp registry";

/**
 * Previous home of the default registry. The URL keeps working, but saved
 * configs are auto-migrated to the add-mcp.com address on read.
 */
export const LEGACY_FIND_REGISTRY_URL =
  "https://mcp.agent-tooling.dev/api/v1/servers";
const LEGACY_FIND_REGISTRY_LABEL = "integrations.sh MCP registry";

function migrateFindRegistryEntry(
  entry: FindRegistryConfigEntry,
): FindRegistryConfigEntry {
  if (entry.url !== LEGACY_FIND_REGISTRY_URL) {
    return entry;
  }
  const label =
    !entry.label || entry.label === LEGACY_FIND_REGISTRY_LABEL
      ? DEFAULT_FIND_REGISTRY_LABEL
      : entry.label;
  return { url: DEFAULT_FIND_REGISTRY_URL, label };
}

export interface AddMcpConfig {
  version: number;
  lastSelectedAgents?: string[];
  findRegistries?: FindRegistryConfigEntry[];
}

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function getConfigPath(): string {
  return join(getXdgConfigHome(), CONFIG_DIR, CONFIG_FILE);
}

function getLegacyConfigPath(): string {
  return join(homedir(), LEGACY_AGENTS_DIR, LEGACY_LOCK_FILE);
}

export async function readConfig(): Promise<AddMcpConfig> {
  const configPath = getConfigPath();

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as AddMcpConfig;

    if (typeof parsed.version !== "number") {
      return createEmptyConfig();
    }

    if (parsed.version < CURRENT_VERSION) {
      return createEmptyConfig();
    }

    return parsed;
  } catch {
    // New config not found — try migrating from legacy location
  }

  const legacyPath = getLegacyConfigPath();
  try {
    const content = await readFile(legacyPath, "utf-8");
    const parsed = JSON.parse(content) as AddMcpConfig;

    if (
      typeof parsed.version !== "number" ||
      parsed.version < CURRENT_VERSION
    ) {
      return createEmptyConfig();
    }

    await writeConfig(parsed);
    await cleanupLegacyConfig();
    return parsed;
  } catch {
    return createEmptyConfig();
  }
}

export async function writeConfig(config: AddMcpConfig): Promise<void> {
  const configPath = getConfigPath();

  await mkdir(dirname(configPath), { recursive: true });

  const content = JSON.stringify(config, null, 2);
  await writeFile(configPath, content, "utf-8");
}

async function cleanupLegacyConfig(): Promise<void> {
  const legacyPath = getLegacyConfigPath();
  try {
    await rm(legacyPath, { force: true });
  } catch {
    // Best-effort cleanup; ignore errors
  }
}

export async function getLastSelectedAgents(): Promise<string[] | undefined> {
  const config = await readConfig();
  return config.lastSelectedAgents;
}

export async function saveSelectedAgents(agents: string[]): Promise<void> {
  const config = await readConfig();
  config.lastSelectedAgents = agents;
  await writeConfig(config);
}

export async function getFindRegistries(): Promise<FindRegistryConfigEntry[]> {
  const config = await readConfig();
  if (!config.findRegistries) return [];

  const normalized = config.findRegistries.map(normalizeFindRegistryEntry);

  // Migrate legacy registry URLs and drop duplicates that migration may
  // produce (e.g. a config that already listed both the old and new URL).
  const migrated: FindRegistryConfigEntry[] = [];
  const seen = new Set<string>();
  for (const entry of normalized.map(migrateFindRegistryEntry)) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    migrated.push(entry);
  }

  const changed =
    migrated.length !== normalized.length ||
    migrated.some(
      (entry, i) =>
        entry.url !== normalized[i]?.url ||
        entry.label !== normalized[i]?.label,
    );

  if (changed) {
    try {
      config.findRegistries = migrated;
      await writeConfig(config);
    } catch {
      // Best-effort persistence; the in-memory result is already migrated.
    }
  }

  return migrated;
}

interface LegacyFindRegistryEntry {
  url?: string;
  serversUrl?: string;
  id?: string;
  label?: string;
}

function normalizeFindRegistryEntry(
  raw: FindRegistryConfigEntry,
): FindRegistryConfigEntry {
  const legacy = raw as unknown as LegacyFindRegistryEntry;
  const url = legacy.url ?? legacy.serversUrl;
  if (!url || typeof url !== "string") {
    throw new Error("Registry entry missing url");
  }
  return {
    url,
    ...(legacy.label ? { label: legacy.label } : {}),
  };
}

export async function saveFindRegistries(
  registries: FindRegistryConfigEntry[],
): Promise<void> {
  const config = await readConfig();
  config.findRegistries = registries;
  await writeConfig(config);
}

function createEmptyConfig(): AddMcpConfig {
  return {
    version: CURRENT_VERSION,
  };
}
