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
import { ROOT_CONFIG_KEY } from "./utils.js";

export { setNestedValue, rewriteJsoncAsJson } from "./json.js";
export {
  deepMerge,
  dropReplacedServers,
  getNestedValue,
  ROOT_CONFIG_KEY,
  isBareServerMap,
} from "./utils.js";

export function readConfig(filePath: string, format: ConfigFormat): ConfigFile {
  switch (format) {
    case "json":
      return readJsonConfig(filePath);
    case "yaml":
      return readYamlConfig(filePath, "1.2");
    case "yaml-1.1":
      return readYamlConfig(filePath, "1.1");
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
      removeYamlConfigKey(filePath, configKey, serverName, "1.2");
      break;
    case "yaml-1.1":
      removeYamlConfigKey(filePath, configKey, serverName, "1.1");
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
      writeYamlConfig(filePath, config, configKey, "1.2");
      break;
    case "yaml-1.1":
      writeYamlConfig(filePath, config, configKey, "1.1");
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
  if (configKey === ROOT_CONFIG_KEY) {
    return { [serverName]: serverConfig };
  }
  const config: ConfigFile = {};
  const servers: ConfigFile = {};
  servers[serverName] = serverConfig;
  setNestedValue(config, configKey, servers);
  return config;
}
