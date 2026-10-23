import { isDeepStrictEqual } from "util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  Document,
  isAlias,
  isMap,
  isScalar,
  parse,
  parseDocument,
  type DocumentOptions,
  type Pair,
  type ParseOptions,
  type ScalarTag,
  type SchemaOptions,
  type Tags,
  type YAMLMap,
} from "yaml";
import type { ConfigFile } from "../types.js";
import { getNestedValue } from "./utils.js";

/**
 * The YAML version the agent's parser uses, so new strings it would read as
 * another type (such as `on` or `2026-10-23` in YAML 1.1) are written quoted.
 */
export type YamlVersion = "1.1" | "1.2";

/**
 * PyYAML reads `1:20` as 80 but `0:20` as a string, while yaml's YAML 1.1
 * schema reads both as numbers. Match PyYAML so `1:20` is quoted when written
 * as a new string.
 */
const PYYAML_SEXAGESIMAL_INT = /^[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+$/;

function isSexagesimalIntTag(tag: Tags[number]): tag is ScalarTag {
  return (
    typeof tag === "object" &&
    !tag.collection &&
    tag.tag === "tag:yaml.org,2002:int" &&
    tag.format === "TIME"
  );
}

function matchPyYamlTags(tags: Tags): Tags {
  return tags.map((tag) =>
    isSexagesimalIntTag(tag) ? { ...tag, test: PYYAML_SEXAGESIMAL_INT } : tag,
  );
}

function yamlOptions(
  version: YamlVersion,
): DocumentOptions & ParseOptions & SchemaOptions {
  return version === "1.1"
    ? { version, merge: true, customTags: matchPyYamlTags }
    : { version, merge: true };
}

export function readYamlConfig(
  filePath: string,
  version: YamlVersion,
): ConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: unknown = parse(
    readFileSync(filePath, "utf-8"),
    yamlOptions(version),
  );
  return (parsed as ConfigFile) || {};
}

function parseSource(
  source: string,
  filePath: string,
  version: YamlVersion,
): Document {
  const doc: Document = parseDocument(source, yamlOptions(version));
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new Error(`${filePath} is not a YAML map.`);
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

/**
 * Only the target server's lines are rewritten. A server map reached through
 * an alias or merge, or written in flow style, cannot be edited that way.
 */
function getServersNode(
  doc: Document,
  filePath: string,
  configKey: string,
): YAMLMap | null | undefined {
  const keyPath = configKey.split(".");
  const path = [
    doc.contents,
    ...keyPath.map((_, i) => doc.getIn(keyPath.slice(0, i + 1), true)),
  ];
  const servers = path[path.length - 1];
  if (path.some(isAliasOrMerge)) {
    throw new Error(
      `${configKey} in ${filePath} uses a YAML alias or merge key, which add-mcp does not edit. Change it by hand.`,
    );
  }
  if (servers === undefined || (isScalar(servers) && servers.value === null)) {
    return doc.hasIn(keyPath) ? null : undefined;
  }
  if (!isMap(servers)) {
    throw new Error(`${configKey} in ${filePath} is not a YAML map.`);
  }
  if (servers.flow && servers.items.length > 0) {
    throw new Error(
      `${configKey} in ${filePath} is a flow-style map, which add-mcp does not edit. Change it by hand.`,
    );
  }
  return servers;
}

function lineStart(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 1;
}

function lineEnd(source: string, offset: number): number {
  if (offset > 0 && source[offset - 1] === "\n") {
    return offset;
  }
  const newline = source.indexOf("\n", offset);
  return newline === -1 ? source.length : newline + 1;
}

/** The source span of one `name: value` entry, from its key's line through its value's last line. */
function pairSpan(source: string, pair: Pair): [number, number] {
  const key = pair.key as { range: [number, number, number] };
  const value = pair.value as { range?: [number, number, number] } | null;
  const end = value?.range ? value.range[2] : key.range[2];
  return [lineStart(source, key.range[0]), lineEnd(source, end)];
}

/** New lines follow the file's own line endings. */
function lineEnding(source: string): string {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function render(
  value: Record<string, unknown>,
  version: YamlVersion,
  eol: string,
  indent: number,
  unit = 2,
): string {
  const text = new Document(value, yamlOptions(version)).toString({
    lineWidth: 0,
    indent: unit,
  });
  const pad = " ".repeat(indent);
  return text.replace(/^(?=.)/gm, pad).replace(/\n/g, eol);
}

function withTrailingNewline(source: string, eol: string): string {
  return source === "" || source.endsWith("\n") ? source : source + eol;
}

/** The line holding the server map's key, with any empty value (`{}`, `~`, `null`) removed. */
function serversKeyLine(
  doc: Document,
  source: string,
  configKey: string,
): { start: number; end: number; indent: number; line: string } {
  const keyPath = configKey.split(".");
  const parent = (
    keyPath.length > 1 ? doc.getIn(keyPath.slice(0, -1), true) : doc.contents
  ) as YAMLMap;
  const pair = parent.items.find(
    (item) =>
      isScalar(item.key) && item.key.value === keyPath[keyPath.length - 1],
  )!;
  const keyRange = (pair.key as { range: [number, number, number] }).range;
  const start = lineStart(source, keyRange[0]);
  const end = lineEnd(source, keyRange[2]);
  const line = source
    .slice(start, end)
    .replace(
      /:[ \t]*(?:\{[ \t]*\}|~|null|Null|NULL)?[ \t]*(#[^\r\n]*)?(?:\r?\n)?$/,
      (_match, comment?: string) =>
        comment
          ? `: ${comment}${lineEnding(source)}`
          : `:${lineEnding(source)}`,
    );
  return { start, end, indent: keyRange[0] - start, line };
}

function upsertServer(
  source: string,
  filePath: string,
  configKey: string,
  name: string,
  entry: unknown,
  version: YamlVersion,
): string {
  const doc = parseSource(source, filePath, version);
  const servers = getServersNode(doc, filePath, configKey);
  const eol = lineEnding(source);

  if (servers === undefined) {
    const nested = configKey
      .split(".")
      .reduceRight<
        Record<string, unknown>
      >((inner, key) => ({ [key]: inner }), {
        [name]: entry,
      });
    return withTrailingNewline(source, eol) + render(nested, version, eol, 0);
  }

  if (servers === null || servers.items.length === 0) {
    const key = serversKeyLine(doc, source, configKey);
    return (
      source.slice(0, key.start) +
      key.line +
      render({ [name]: entry }, version, eol, key.indent + 2) +
      source.slice(key.end)
    );
  }

  const first = servers.items[0]!.key as { range: [number, number, number] };
  const indent = first.range[0] - lineStart(source, first.range[0]);
  const unit = indent - serversKeyLine(doc, source, configKey).indent;
  const snippet = render({ [name]: entry }, version, eol, indent, unit);
  const existing = servers.items.find(
    (pair) => isScalar(pair.key) && pair.key.value === name,
  );
  if (existing) {
    const [start, end] = pairSpan(source, existing);
    return source.slice(0, start) + snippet + source.slice(end);
  }

  const [, end] = pairSpan(source, servers.items[servers.items.length - 1]!);
  return (
    withTrailingNewline(source.slice(0, end), eol) + snippet + source.slice(end)
  );
}

/** Re-reads the edited text so a wrong edit fails here instead of reaching the agent. */
function verifyEdit(
  updated: string,
  filePath: string,
  keyPath: string[],
  expected: Record<string, unknown>,
  version: YamlVersion,
): void {
  const after = parse(updated, yamlOptions(version)) as ConfigFile | null;
  const servers = getNestedValue(after ?? {}, keyPath.join("."));
  if (!isDeepStrictEqual(servers, expected)) {
    throw new Error(
      `add-mcp could not edit ${filePath} safely. The file was not changed.`,
    );
  }
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

  const source = readFileSync(filePath, "utf-8");
  const doc = parseSource(source, filePath, version);
  const servers = getServersNode(doc, filePath, configKey);
  const pair = servers?.items.find(
    (item) => isScalar(item.key) && item.key.value === serverName,
  );
  if (!servers || !pair) {
    return;
  }

  const [start, end] = pairSpan(source, pair);
  let updated = source.slice(0, start) + source.slice(end);
  if (servers.items.length === 1) {
    const key = serversKeyLine(doc, source, configKey);
    updated =
      source.slice(0, key.start) +
      key.line.replace(
        /:( #[^\r\n]*)?\r?\n$/,
        (_match, comment = "") => `: {}${comment}${lineEnding(source)}`,
      ) +
      source.slice(key.end, start) +
      source.slice(end);
  }
  const expected = { ...(servers.toJS(doc) as Record<string, unknown>) };
  delete expected[serverName];
  verifyEdit(updated, filePath, configKey.split("."), expected, version);
  writeFileSync(filePath, updated);
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

  const original = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const keyPath = configKey.split(".");
  const before = getNestedValue(
    (parse(original, yamlOptions(version)) as ConfigFile | null) ?? {},
    configKey,
  );
  const expected: Record<string, unknown> = {
    ...(before && typeof before === "object" ? before : {}),
  };

  let updated = original;
  const incoming = getNestedValue(config, configKey) as ConfigFile;
  for (const [name, entry] of Object.entries(incoming)) {
    updated = upsertServer(updated, filePath, configKey, name, entry, version);
    expected[name] = entry;
  }

  verifyEdit(updated, filePath, keyPath, expected, version);
  writeFileSync(filePath, updated);
}
