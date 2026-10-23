import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { Document, isMap, parse, parseDocument } from "yaml";
import type { ConfigFile } from "../types.js";
import { getNestedValue } from "./utils.js";

export function readYamlConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = parse(readFileSync(filePath, "utf-8"));
  return (parsed as ConfigFile) || {};
}

/** Goose and Hermes keep all their settings in this file; editing the document in place keeps its comments. */
function loadDocument(filePath: string): Document {
  if (!existsSync(filePath)) {
    return new Document({});
  }

  const doc: Document = parseDocument(readFileSync(filePath, "utf-8"));
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }
  if (!isMap(doc.contents)) {
    doc.contents = doc.createNode({});
  }
  return doc;
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
  const serverPath = [...configKey.split("."), serverName];
  if (!doc.hasIn(serverPath)) {
    return;
  }

  doc.deleteIn(serverPath);
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
  const serversNode = doc.getIn(keyPath, true);
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
