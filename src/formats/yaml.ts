import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  Document,
  isAlias,
  isMap,
  isScalar,
  parse,
  parseDocument,
  type YAMLMap,
} from "yaml";
import type { ConfigFile } from "../types.js";
import { getNestedValue } from "./utils.js";

/**
 * The YAML version the agent's parser uses. Parsing and writing in that
 * version keeps existing values intact and quotes new strings that it would
 * read as another type, such as `on` or `2026-10-23` in YAML 1.1.
 */
export type YamlVersion = "1.1" | "1.2";

export function readYamlConfig(
  filePath: string,
  version: YamlVersion,
): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = parse(readFileSync(filePath, "utf-8"), {
    version,
    merge: true,
  });
  return (parsed as ConfigFile) || {};
}

/** Goose and Hermes keep all their settings in this file; editing the document in place keeps its comments. */
function loadDocument(filePath: string, version: YamlVersion): Document {
  if (!existsSync(filePath)) {
    return new Document({}, { version });
  }

  const doc: Document = parseDocument(readFileSync(filePath, "utf-8"), {
    version,
    merge: true,
  });
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }
  if (!isMap(doc.contents)) {
    doc.contents = doc.createNode({});
  }
  return doc;
}

function isAliasOrMerge(node: unknown): boolean {
  return (
    isAlias(node) ||
    (isMap(node) &&
      node.items.some(
        (pair) =>
          isScalar(pair.key) &&
          typeof pair.key.value === "symbol" &&
          pair.key.value.description === "<<",
      ))
  );
}

/** Editing a server map reached through an alias or merge would change, or hide, the settings it shares. */
function getServersMap(
  doc: Document,
  filePath: string,
  configKey: string,
): YAMLMap | undefined {
  const keyPath = configKey.split(".");
  const path = [
    doc.contents,
    ...keyPath.map((_, i) => doc.getIn(keyPath.slice(0, i + 1), true)),
  ];
  if (path.some(isAliasOrMerge)) {
    throw new Error(
      `${configKey} in ${filePath} uses a YAML alias or merge key, which add-mcp does not edit. Change it by hand.`,
    );
  }
  const servers = path[path.length - 1];
  return isMap(servers) ? servers : undefined;
}

function saveDocument(filePath: string, doc: Document): void {
  writeFileSync(filePath, doc.toString({ lineWidth: 0 }));
}

export function removeYamlConfigKey(
  filePath: string,
  configKey: string,
  serverName: string,
  version: YamlVersion,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const doc = loadDocument(filePath, version);
  const servers = getServersMap(doc, filePath, configKey);
  if (!servers?.has(serverName)) {
    return;
  }

  servers.delete(serverName);
  saveDocument(filePath, doc);
}

export function writeYamlConfig(
  filePath: string,
  config: ConfigFile,
  configKey: string,
  version: YamlVersion,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const doc = loadDocument(filePath, version);
  const keyPath = configKey.split(".");
  const servers = getServersMap(doc, filePath, configKey);
  if (!servers) {
    doc.setIn(keyPath, doc.createNode({}));
  } else if (servers.items.length === 0) {
    servers.flow = false;
  }

  const incoming = getNestedValue(config, configKey) as ConfigFile;
  for (const [name, entry] of Object.entries(incoming)) {
    doc.setIn([...keyPath, name], doc.createNode(entry));
  }

  saveDocument(filePath, doc);
}
