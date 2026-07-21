import type { ConfigFile } from "../types.js";

export function deepMerge(target: ConfigFile, source: ConfigFile): ConfigFile {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      result[key] = deepMerge(
        (targetValue && typeof targetValue === "object"
          ? targetValue
          : {}) as ConfigFile,
        sourceValue as ConfigFile,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Deletes from `existing` any server entries that `incoming` is about to
 * write under `configKey`, so re-installing a server replaces its entry
 * wholesale instead of deep-merging into the old one. Without this, stale
 * fields from a previous install survive the merge — e.g. an old stdio
 * `command`/`args`/`env` alongside a new remote `url`, which Codex rejects
 * as an invalid config ("url is not supported for stdio").
 */
export function dropReplacedServers(
  existing: ConfigFile,
  incoming: ConfigFile,
  configKey: string,
): void {
  const incomingServers = getNestedValue(incoming, configKey);
  const existingServers = getNestedValue(existing, configKey);

  if (
    !incomingServers ||
    typeof incomingServers !== "object" ||
    Array.isArray(incomingServers) ||
    !existingServers ||
    typeof existingServers !== "object" ||
    Array.isArray(existingServers)
  ) {
    return;
  }

  for (const name of Object.keys(incomingServers)) {
    delete (existingServers as ConfigFile)[name];
  }
}

export function getNestedValue(obj: ConfigFile, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as ConfigFile)[key];
    } else {
      return undefined;
    }
  }

  return current;
}
