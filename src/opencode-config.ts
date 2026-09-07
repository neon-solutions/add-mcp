import { existsSync, readFileSync } from "fs";
import * as jsonc from "jsonc-parser";
import {
  removeJsonConfigKey,
  writeJsonConfig,
  setNestedValue,
} from "./formats/json.js";

export const OPENCODE_LEGACY_CONFIG_KEY = "mcp";
export const OPENCODE_NATIVE_CONFIG_KEY = "mcp.servers";

type JsonObject = Record<string, unknown>;

export type OpenCodeUpsertKey =
  | typeof OPENCODE_LEGACY_CONFIG_KEY
  | typeof OPENCODE_NATIVE_CONFIG_KEY;

export type OpenCodeListedServer = {
  serverName: string;
  config: JsonObject;
  configKey: OpenCodeUpsertKey;
};

type OpenCodeLayout = {
  nativeMap: JsonObject | null;
  legacy: Record<string, JsonObject>;
  timeoutIsMetadata: boolean;
};

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isEnablementOnly(value: JsonObject): boolean {
  return (
    (typeof value.enabled === "boolean" ||
      typeof value.disabled === "boolean") &&
    value.type === undefined &&
    typeof value.url !== "string" &&
    typeof value.command !== "string" &&
    !Array.isArray(value.command)
  );
}

export function isOpenCodeServerEntry(value: unknown): value is JsonObject {
  if (!isJsonObject(value)) {
    return false;
  }
  if (value.type === "local" || value.type === "remote") {
    return true;
  }
  if (typeof value.url === "string" && value.url.length > 0) {
    return true;
  }
  if (typeof value.command === "string" && value.command.length > 0) {
    return true;
  }
  if (
    Array.isArray(value.command) &&
    value.command.some((part) => typeof part === "string")
  ) {
    return true;
  }
  return isEnablementOnly(value);
}

function isTimeoutMetadata(value: unknown): boolean {
  if (typeof value === "number") {
    return true;
  }
  if (!isJsonObject(value) || isOpenCodeServerEntry(value)) {
    return false;
  }
  return (
    "startup" in value ||
    "catalog" in value ||
    "execution" in value ||
    "request" in value
  );
}

function parseOpenCodeJsonc(configPath: string): JsonObject {
  if (!existsSync(configPath)) {
    return {};
  }

  const text = readFileSync(configPath, "utf-8");
  const errors: jsonc.ParseError[] = [];
  const parsed: unknown = jsonc.parse(text, errors, {
    allowTrailingComma: true,
  });
  // ValueExpected also fires for tokens like `}` and `,`. Only a file that
  // is empty after comments are stripped is an empty config.
  if (
    parsed === undefined &&
    jsonc.stripComments(text).trim() === "" &&
    errors.every((error) => error.error === jsonc.ParseErrorCode.ValueExpected)
  ) {
    return {};
  }
  if (errors.length > 0) {
    throw new Error(`Invalid JSON in ${configPath}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${configPath} must be a JSON object`);
  }
  return parsed as JsonObject;
}

function classifyOpenCodeDocument(
  document: JsonObject,
  configPath: string,
): OpenCodeLayout {
  if (!("mcp" in document)) {
    return { nativeMap: null, legacy: {}, timeoutIsMetadata: false };
  }

  const mcp = document.mcp;
  if (!isJsonObject(mcp)) {
    throw new Error(`${configPath} mcp must be a JSON object`);
  }

  let nativeMap: JsonObject | null = null;
  if ("servers" in mcp) {
    const servers = mcp.servers;
    if (!isJsonObject(servers)) {
      throw new Error(`${configPath} mcp.servers must be a JSON object`);
    }
    // A V1 file can store a real server named "servers". Only treat this
    // object as the V2 map when it is not itself a server entry.
    if (!isOpenCodeServerEntry(servers)) {
      nativeMap = servers;
    }
  }

  const legacy: Record<string, JsonObject> = {};
  for (const [name, value] of Object.entries(mcp)) {
    if (name === "servers" && nativeMap) {
      continue;
    }
    if (name === "timeout" && isTimeoutMetadata(value)) {
      continue;
    }
    if (isOpenCodeServerEntry(value)) {
      legacy[name] = value;
    }
  }

  return {
    nativeMap,
    legacy,
    timeoutIsMetadata: isTimeoutMetadata(mcp.timeout),
  };
}

export function readOpenCodeLayout(configPath: string): OpenCodeLayout {
  return classifyOpenCodeDocument(parseOpenCodeJsonc(configPath), configPath);
}

function listedNativeServers(
  nativeMap: JsonObject | null,
): Record<string, JsonObject> {
  if (!nativeMap) {
    return {};
  }
  const listed: Record<string, JsonObject> = {};
  for (const [name, value] of Object.entries(nativeMap)) {
    if (isOpenCodeServerEntry(value)) {
      listed[name] = value;
    }
  }
  return listed;
}

export function listOpenCodeServers(
  configPath: string,
): OpenCodeListedServer[] {
  const layout = readOpenCodeLayout(configPath);
  const nativeListed = listedNativeServers(layout.nativeMap);
  const names = new Set([
    ...Object.keys(layout.legacy),
    ...Object.keys(layout.nativeMap ?? {}),
  ]);

  const servers: OpenCodeListedServer[] = [];
  for (const serverName of names) {
    // A V1 server named `toString` must not pick up Object.prototype.toString.
    if (Object.hasOwn(nativeListed, serverName)) {
      const nativeEntry = nativeListed[serverName];
      if (nativeEntry) {
        servers.push({
          serverName,
          config: nativeEntry,
          configKey: OPENCODE_NATIVE_CONFIG_KEY,
        });
      }
      continue;
    }
    if (layout.nativeMap && Object.hasOwn(layout.nativeMap, serverName)) {
      continue;
    }
    const legacyEntry = layout.legacy[serverName];
    if (legacyEntry) {
      servers.push({
        serverName,
        config: legacyEntry,
        configKey: OPENCODE_LEGACY_CONFIG_KEY,
      });
    }
  }
  return servers;
}

function slotHoldsNonServer(
  mcp: JsonObject | undefined,
  name: string,
): boolean {
  if (!mcp || !(name in mcp)) {
    return false;
  }
  return !isOpenCodeServerEntry(mcp[name]);
}

export function resolveOpenCodeUpsertKey(
  configPath: string,
  serverName: string,
): OpenCodeUpsertKey {
  const document = parseOpenCodeJsonc(configPath);
  const layout = classifyOpenCodeDocument(document, configPath);

  if (layout.nativeMap && Object.hasOwn(layout.nativeMap, serverName)) {
    return OPENCODE_NATIVE_CONFIG_KEY;
  }
  if (Object.hasOwn(layout.legacy, serverName)) {
    return OPENCODE_LEGACY_CONFIG_KEY;
  }
  if (layout.nativeMap && Object.keys(layout.legacy).length === 0) {
    return OPENCODE_NATIVE_CONFIG_KEY;
  }

  const mcp = isJsonObject(document.mcp) ? document.mcp : undefined;
  const collidingMetadata =
    (serverName === "servers" || serverName === "timeout") &&
    slotHoldsNonServer(mcp, serverName);

  if (collidingMetadata) {
    if (layout.nativeMap) {
      return OPENCODE_NATIVE_CONFIG_KEY;
    }
    throw new Error(
      `${configPath} already uses mcp.${serverName} for OpenCode settings. Rename the server or move that setting before installing "${serverName}".`,
    );
  }

  return OPENCODE_LEGACY_CONFIG_KEY;
}

const OAUTH_LEGACY_TO_NATIVE: Record<string, string> = {
  clientId: "client_id",
  clientSecret: "client_secret",
  callbackPort: "callback_port",
  redirectUri: "redirect_uri",
};

const OAUTH_NATIVE_TO_LEGACY: Record<string, string> = {
  client_id: "clientId",
  client_secret: "clientSecret",
  callback_port: "callbackPort",
  redirect_uri: "redirectUri",
};

function renameOAuthFields(
  oauth: JsonObject,
  names: Record<string, string>,
): JsonObject {
  const next: JsonObject = {};
  const targetNames = new Set(Object.values(names));
  for (const [key, value] of Object.entries(oauth)) {
    const mapped = names[key];
    if (mapped) {
      if (!Object.hasOwn(next, mapped)) {
        next[mapped] = value;
      }
      continue;
    }
    if (targetNames.has(key) && Object.hasOwn(next, key)) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function translateTimeout(
  timeout: unknown,
  toNative: boolean,
): unknown | undefined {
  if (toNative) {
    if (typeof timeout === "number") {
      // V1's millisecond timeout is the request timeout.
      return { request: timeout };
    }
    if (isJsonObject(timeout)) {
      return timeout;
    }
    return undefined;
  }
  if (typeof timeout === "number") {
    return timeout;
  }
  if (isJsonObject(timeout) && typeof timeout.request === "number") {
    return timeout.request;
  }
  return undefined;
}

function translateOpenCodeEntry(
  config: JsonObject,
  fromKey: OpenCodeUpsertKey,
  toKey: OpenCodeUpsertKey,
): JsonObject {
  const next: JsonObject = { ...config };
  if (fromKey === toKey) {
    return next;
  }
  const toNative = toKey === OPENCODE_NATIVE_CONFIG_KEY;
  if (toNative) {
    const disabled = next.disabled === true || next.enabled === false;
    delete next.enabled;
    delete next.disabled;
    if (disabled) {
      next.disabled = true;
    }
  } else {
    if (next.disabled === true) {
      next.enabled = false;
    } else if (typeof next.enabled !== "boolean") {
      next.enabled = true;
    }
    delete next.disabled;
  }

  if ("timeout" in next) {
    const timeout = translateTimeout(next.timeout, toNative);
    if (timeout === undefined) {
      delete next.timeout;
    } else {
      next.timeout = timeout;
    }
  }

  if (isJsonObject(next.oauth)) {
    next.oauth = renameOAuthFields(
      next.oauth,
      toNative ? OAUTH_LEGACY_TO_NATIVE : OAUTH_NATIVE_TO_LEGACY,
    );
  }
  return next;
}

function resolveOpenCodeRelocateKey(
  configPath: string,
  newName: string,
  sourceKey: OpenCodeUpsertKey,
): OpenCodeUpsertKey {
  const document = parseOpenCodeJsonc(configPath);
  const layout = classifyOpenCodeDocument(document, configPath);
  const mcp = isJsonObject(document.mcp) ? document.mcp : undefined;
  const collidingMetadata =
    (newName === "servers" || newName === "timeout") &&
    slotHoldsNonServer(mcp, newName);
  if (!collidingMetadata) {
    return sourceKey;
  }
  if (layout.nativeMap) {
    return OPENCODE_NATIVE_CONFIG_KEY;
  }
  throw new Error(
    `${configPath} already uses mcp.${newName} for OpenCode settings. Rename the server or move that setting before using "${newName}".`,
  );
}

export function relocateOpenCodeServer(
  configPath: string,
  oldName: string,
  newName: string,
): void {
  if (oldName === newName) {
    return;
  }

  const listed = listOpenCodeServers(configPath);
  const existing = listed.find((entry) => entry.serverName === oldName);
  if (!existing) {
    throw new Error(`${configPath} has no OpenCode server named "${oldName}"`);
  }

  // The dest name is already a server. Overwriting it would replace a
  // valid native entry with a translated copy of the alias.
  if (listed.some((entry) => entry.serverName === newName)) {
    removeOpenCodeServer(configPath, oldName);
    return;
  }

  // Mixed-file installs still add new names as V1. A rename is not an
  // install: moving a native server into V1 drops timeout.startup.
  const destKey = resolveOpenCodeRelocateKey(
    configPath,
    newName,
    existing.configKey,
  );
  const written = translateOpenCodeEntry(
    existing.config,
    existing.configKey,
    destKey,
  );
  const document: JsonObject = {};
  setNestedValue(document, destKey, { [newName]: written });
  writeJsonConfig(configPath, document, destKey);
  removeOpenCodeServer(configPath, oldName);
}

export function removeOpenCodeServer(
  configPath: string,
  serverName: string,
): boolean {
  if (!existsSync(configPath)) {
    return false;
  }

  const layout = readOpenCodeLayout(configPath);
  const inNative = !!(
    layout.nativeMap && Object.hasOwn(layout.nativeMap, serverName)
  );
  const inLegacy = Object.hasOwn(layout.legacy, serverName);
  if (!inNative && !inLegacy) {
    return false;
  }

  if (inNative) {
    removeJsonConfigKey(configPath, OPENCODE_NATIVE_CONFIG_KEY, serverName);
  }
  if (inLegacy) {
    // Listing hid a same-name legacy copy. Leaving it would make that
    // server reappear once the native entry is gone.
    removeJsonConfigKey(configPath, OPENCODE_LEGACY_CONFIG_KEY, serverName);
  }
  return true;
}
