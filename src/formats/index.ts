import type { ConfigFile, ConfigFormat } from "../types.js";
import {
  readJsonConfig,
  writeJsonConfig,
  removeJsonConfigKey,
  setNestedValue,
} from "./json.js";
import {
  readYamlConfig,
  writeYamlConfig,
  removeYamlConfigKey,
} from "./yaml.js";
import {
  readTomlConfig,
  writeTomlConfig,
  removeTomlConfigKey,
} from "./toml.js";

export { setNestedValue } from "./json.js";
export { deepMerge, dropReplacedServers, getNestedValue } from "./utils.js";

export function readConfig(filePath: string, format: ConfigFormat): ConfigFile {
  switch (format) {
    case "json":
      return readJsonConfig(filePath);
    case "yaml":
      return readYamlConfig(filePath);
    case "toml":
      return readTomlConfig(filePath);
    default:
      throw new Error(`Unsupported config format: ${format}`);
  }
}

export function removeServerFromConfig(
  filePath: string,
  format: ConfigFormat,
  configKey: string,
  serverName: string,
): void {
  switch (format) {
    case "json":
      removeJsonConfigKey(filePath, configKey, serverName);
      break;
    case "yaml":
      removeYamlConfigKey(filePath, configKey, serverName);
      break;
    case "toml":
      removeTomlConfigKey(filePath, configKey, serverName);
      break;
    default:
      throw new Error(`Unsupported config format: ${format}`);
  }
}

export function writeConfig(
  filePath: string,
  config: ConfigFile,
  format: ConfigFormat,
  configKey: string,
): void {
  switch (format) {
    case "json":
      writeJsonConfig(filePath, config, configKey);
      break;
    case "yaml":
      writeYamlConfig(filePath, config, configKey);
      break;
    case "toml":
      writeTomlConfig(filePath, config, configKey);
      break;
    default:
      throw new Error(`Unsupported config format: ${format}`);
  }
}

export function buildConfigWithKey(
  configKey: string,
  serverName: string,
  serverConfig: unknown,
): ConfigFile {
  const config: ConfigFile = {};
  const servers: ConfigFile = {};
  servers[serverName] = serverConfig;
  setNestedValue(config, configKey, servers);
  return config;
}
