import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as jsonc from "jsonc-parser";
import type { ConfigFile } from "../types.js";
import {
  deepMerge,
  dropReplacedServers,
  getNestedValue,
  jsoncPath,
  ROOT_CONFIG_KEY,
} from "./utils.js";

function detectIndent(text: string): {
  tabSize: number;
  insertSpaces: boolean;
} {
  let result: { tabSize: number; insertSpaces: boolean } | null = null;

  jsonc.visit(text, {
    onObjectProperty: (
      _property,
      offset,
      _length,
      startLine,
      startCharacter,
    ) => {
      if (result === null && startLine > 0 && startCharacter > 0) {
        const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
        const whitespace = text.slice(lineStart, offset);
        result = {
          tabSize: startCharacter,
          insertSpaces: !whitespace.includes("\t"),
        };
      }
    },
  });

  return result || { tabSize: 2, insertSpaces: true };
}

export function readJsonConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = jsonc.parse(content);
  return parsed as ConfigFile;
}

/** Preserves comments and formatting when possible */
export function writeJsonConfig(
  filePath: string,
  config: ConfigFile,
  configKey: string,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let originalContent = "";
  let existingConfig: ConfigFile = {};

  if (existsSync(filePath)) {
    originalContent = readFileSync(filePath, "utf-8");
    existingConfig = jsonc.parse(originalContent) as ConfigFile;
  }

  dropReplacedServers(existingConfig, config, configKey);
  const mergedConfig = deepMerge(existingConfig, config);

  if (originalContent) {
    try {
      const configKeyPath = jsoncPath(configKey);
      const newValue = getNestedValue(mergedConfig, configKey);
      const edits = jsonc.modify(originalContent, configKeyPath, newValue, {
        formattingOptions: detectIndent(originalContent),
      });
      const updatedContent = jsonc.applyEdits(originalContent, edits);
      writeFileSync(filePath, updatedContent);
      return;
    } catch {
      // jsonc-parser failed, fall back to JSON.stringify
    }
  }

  writeFileSync(filePath, JSON.stringify(mergedConfig, null, 2));
}

export function removeJsonConfigKey(
  filePath: string,
  configKey: string,
  serverName: string,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const originalContent = readFileSync(filePath, "utf-8");
  const configKeyPath = jsoncPath(configKey);

  try {
    const edits = jsonc.modify(
      originalContent,
      [...configKeyPath, serverName],
      undefined,
      { formattingOptions: detectIndent(originalContent) },
    );
    const updatedContent = jsonc.applyEdits(originalContent, edits);
    writeFileSync(filePath, updatedContent);
    return;
  } catch {
    // jsonc-parser failed, fall back to manual removal
  }

  const parsed = jsonc.parse(originalContent) as ConfigFile;
  const servers = getNestedValue(parsed, configKey);
  if (servers && typeof servers === "object" && serverName in servers) {
    delete (servers as ConfigFile)[serverName];
  }
  writeFileSync(filePath, JSON.stringify(parsed, null, 2));
}

export function setNestedValue(
  obj: ConfigFile,
  path: string,
  value: unknown,
): void {
  if (path === ROOT_CONFIG_KEY) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    for (const key of Object.keys(obj)) {
      delete obj[key];
    }
    Object.assign(obj, value);
    return;
  }

  const keys = path.split(".");
  const lastKey = keys.pop();

  if (!lastKey) return;

  let current = obj;
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as ConfigFile;
  }

  current[lastKey] = value;
}
