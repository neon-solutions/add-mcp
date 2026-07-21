import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as TOML from "@iarna/toml";
import type { ConfigFile } from "../types.js";
import { deepMerge, dropReplacedServers } from "./utils.js";

export function readTomlConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = TOML.parse(content);

  return parsed as ConfigFile;
}

export function removeTomlConfigKey(
  filePath: string,
  configKey: string,
  serverName: string,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const existing = readTomlConfig(filePath);
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

  const content = TOML.stringify(existing as TOML.JsonMap);
  writeFileSync(filePath, content);
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

  let existingConfig: ConfigFile = {};
  if (existsSync(filePath)) {
    existingConfig = readTomlConfig(filePath);
  }

  dropReplacedServers(existingConfig, config, configKey);
  const mergedConfig = deepMerge(existingConfig, config);
  const content = TOML.stringify(mergedConfig as TOML.JsonMap);

  writeFileSync(filePath, content);
}
