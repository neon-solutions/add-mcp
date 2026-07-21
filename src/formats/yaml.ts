import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import yaml from "js-yaml";
import type { ConfigFile } from "../types.js";
import { deepMerge, dropReplacedServers } from "./utils.js";

export function readYamlConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(content);

  return (parsed as ConfigFile) || {};
}

export function removeYamlConfigKey(
  filePath: string,
  configKey: string,
  serverName: string,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const existing = readYamlConfig(filePath);
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

  const content = yaml.dump(existing, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  writeFileSync(filePath, content);
}

export function writeYamlConfig(
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
    existingConfig = readYamlConfig(filePath);
  }

  dropReplacedServers(existingConfig, config, configKey);
  const mergedConfig = deepMerge(existingConfig, config);

  const content = yaml.dump(mergedConfig, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });

  writeFileSync(filePath, content);
}
