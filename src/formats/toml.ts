import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as TOML from "@iarna/toml";
import {
  parse as parseToml,
  patch as patchToml,
  stringify as stringifyToml,
  TomlFormat,
} from "@decimalturn/toml-patch";
import type { ConfigFile } from "../types.js";
import { deepMerge, dropReplacedServers, getNestedValue } from "./utils.js";

export function readTomlConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = TOML.parse(content);

  return parsed as ConfigFile;
}

/**
 * Apply `updated` to the TOML text as a patch, so comments, key order and
 * formatting outside the changed entries survive. Parsing and printing the
 * whole file dropped every comment in a hand-edited config such as Codex's
 * `config.toml`.
 */
function patchTomlText(content: string, updated: ConfigFile): string {
  return patchToml(content, updated, TomlFormat.autoDetectFormat(content));
}

function serverNames(config: ConfigFile, configKey: string): string[] {
  const servers = getNestedValue(config, configKey);
  return servers && typeof servers === "object" && !Array.isArray(servers)
    ? Object.keys(servers)
    : [];
}

/** A TOML key, quoted when it is not a valid bare key. */
function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

/**
 * Whether `content` holds exactly `expected`. Both sides go through the same
 * parser, so value types and object prototypes compare equal.
 */
function sameToml(content: string, expected: ConfigFile): boolean {
  return (
    JSON.stringify(parseToml(content)) ===
    JSON.stringify(parseToml(stringifyToml(expected)))
  );
}

/** `content` with an empty `[<configKey>.<name>]` table appended per name. */
function withServerTables(
  content: string,
  names: string[],
  configKey: string,
): string {
  const prefix = configKey.split(".").map(tomlKey).join(".");
  const headers = names
    .map((name) => `[${prefix}.${tomlKey(name)}]\n`)
    .join("\n");
  return content.trim() === ""
    ? headers
    : `${content.replace(/\n*$/, "\n")}\n${headers}`;
}

/**
 * Patch in servers that are new to the file as `[<configKey>.<name>]`
 * tables at the end, the way a person would write them. A patch alone
 * inserts a new key as a dotted inline table among the root keys. The
 * empty header gives it a table to fill instead. When that cannot produce
 * the intended config (for example when the servers are one inline table),
 * the plain patch is used.
 */
function patchWithNewServerTables(
  content: string,
  existingNames: ReadonlySet<string>,
  merged: ConfigFile,
  configKey: string,
): string {
  const newNames = serverNames(merged, configKey).filter(
    (name) => !existingNames.has(name),
  );
  if (newNames.length === 0) return patchTomlText(content, merged);

  try {
    const patched = patchTomlText(
      withServerTables(content, newNames, configKey),
      merged,
    );
    if (sameToml(patched, merged)) return patched;
  } catch {
    // The table does not fit this file (an inline table cannot be
    // extended), so the plain patch below decides where the server goes.
  }
  return patchTomlText(content, merged);
}

export function removeTomlConfigKey(
  filePath: string,
  configKey: string,
  serverName: string,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf-8");
  const existing = parseToml(content) as ConfigFile;
  const keys = configKey.split(".");
  let current: unknown = existing;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as ConfigFile)[key];
    } else {
      return;
    }
  }

  if (current && typeof current === "object" && serverName in current) {
    delete (current as ConfigFile)[serverName];
  }

  writeFileSync(filePath, patchTomlText(content, existing));
}

export function writeTomlConfig(
  filePath: string,
  config: ConfigFile,
  configKey: string,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const existingConfig = parseToml(content) as ConfigFile;
  // Taken before dropReplacedServers edits the config in place.
  const existingNames = new Set(serverNames(existingConfig, configKey));

  dropReplacedServers(existingConfig, config, configKey);
  const mergedConfig = deepMerge(existingConfig, config);

  writeFileSync(
    filePath,
    patchWithNewServerTables(content, existingNames, mergedConfig, configKey),
  );
}
