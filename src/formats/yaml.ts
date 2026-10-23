import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  Document,
  Scalar,
  isAlias,
  isMap,
  isScalar,
  parse,
  parseDocument,
  visit,
  type YAMLMap,
} from "yaml";
import type { ConfigFile } from "../types.js";
import { getNestedValue } from "./utils.js";

/** Strings YAML 1.1 reads as booleans. Hermes loads YAML 1.1, so these are written quoted. */
const YAML_1_1_BOOLEAN =
  /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;

export function readYamlConfig(filePath: string): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = parse(readFileSync(filePath, "utf-8"), {
    merge: true,
  });
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

/** Editing an aliased or merged map would change the anchored settings it shares. */
function getServersMap(
  doc: Document,
  filePath: string,
  configKey: string,
): YAMLMap | undefined {
  const node = doc.getIn(configKey.split("."), true);
  const isShared =
    isAlias(node) ||
    (isMap(node) &&
      node.items.some((pair) => isScalar(pair.key) && pair.key.value === "<<"));
  if (isShared) {
    throw new Error(
      `${configKey} in ${filePath} uses a YAML alias or merge key, which add-mcp does not edit. Change it by hand.`,
    );
  }
  return isMap(node) ? node : undefined;
}

function createEntryNode(doc: Document, entry: unknown) {
  const node = doc.createNode(entry);
  visit(node, {
    Scalar(_key, scalar) {
      if (
        typeof scalar.value === "string" &&
        YAML_1_1_BOOLEAN.test(scalar.value)
      ) {
        scalar.type = Scalar.QUOTE_DOUBLE;
      }
    },
  });
  return node;
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
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const doc = loadDocument(filePath);
  const keyPath = configKey.split(".");
  const servers = getServersMap(doc, filePath, configKey);
  if (!servers) {
    doc.setIn(keyPath, doc.createNode({}));
  } else if (servers.items.length === 0) {
    servers.flow = false;
  }

  const incoming = getNestedValue(config, configKey) as ConfigFile;
  for (const [name, entry] of Object.entries(incoming)) {
    doc.setIn([...keyPath, name], createEntryNode(doc, entry));
  }

  saveDocument(filePath, doc);
}
