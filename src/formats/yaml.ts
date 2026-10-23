import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { Document, isAlias, isMap, parse, parseDocument } from "yaml";
import type { ConfigFile } from "../types.js";
import { getNestedValue } from "./utils.js";

/** Hermes loads YAML 1.1, so strings such as `off` and `yes` must be written quoted. */
const YAML_VERSION = { version: "1.1" } as const;

export function readYamlConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = parse(readFileSync(filePath, "utf-8"), YAML_VERSION);
  return (parsed as ConfigFile) || {};
}

/** Goose and Hermes keep all their settings in this file; editing the document in place keeps its comments. */
function loadDocument(filePath: string): Document {
  if (!existsSync(filePath)) {
    return new Document({}, YAML_VERSION);
  }

  const doc: Document = parseDocument(
    readFileSync(filePath, "utf-8"),
    YAML_VERSION,
  );
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }
  if (!isMap(doc.contents)) {
    doc.contents = doc.createNode({});
  }
  return doc;
}

/** An aliased server map is replaced by a copy, so edits leave the anchored map alone. */
function getServersNode(doc: Document, keyPath: string[]): unknown {
  const node = doc.getIn(keyPath, true);
  if (!isAlias(node)) {
    return node;
  }
  const resolved = node.resolve(doc);
  doc.setIn(keyPath, doc.createNode(resolved ? resolved.toJS(doc) : {}));
  return doc.getIn(keyPath, true);
}

function saveDocument(filePath: string, doc: Document): void {
  writeFileSync(filePath, doc.toString({ lineWidth: 0 }));
}

export function removeYamlConfigKey(
  filePath: string,
  configKey: string,
  serverName: string,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const doc = loadDocument(filePath);
  const servers = getServersNode(doc, configKey.split("."));
  if (!isMap(servers) || !servers.has(serverName)) {
    return;
  }

  servers.delete(serverName);
  saveDocument(filePath, doc);
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

  const doc = loadDocument(filePath);
  const keyPath = configKey.split(".");
  const serversNode = getServersNode(doc, keyPath);
  if (!isMap(serversNode)) {
    doc.setIn(keyPath, doc.createNode({}));
  } else if (serversNode.items.length === 0) {
    serversNode.flow = false;
  }

  const servers = getNestedValue(config, configKey) as ConfigFile;
  for (const [name, entry] of Object.entries(servers)) {
    doc.setIn([...keyPath, name], doc.createNode(entry));
  }

  saveDocument(filePath, doc);
}
