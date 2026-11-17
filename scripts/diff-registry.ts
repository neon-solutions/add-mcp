#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { queryServers } from "../registry/src/lib/query-servers.js";
import {
  sourceRegistrySchema,
  type ServerEntry,
} from "../registry/src/lib/schema.js";
import {
  buildInstallPlanForEntry,
  filterSmitheryWhenAlternativesExist,
  rankRegistryEntries,
  toEntry,
  type RegistryServerEntry,
  type RegistryServerListItem,
} from "../src/find.js";

const POPULAR_QUERIES = [
  "github",
  "figma",
  "playwright",
  "supabase",
  "neon",
  "linear",
  "notion",
  "stripe",
  "sentry",
  "vercel",
  "context7",
];

type Server = NonNullable<RegistryServerListItem["server"]>;

function parseArgs(argv: string[]): { base: string } {
  let base = "origin/main";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--base" && next) {
      base = next;
      i++;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return { base };
}

function servers(items: RegistryServerListItem[], source: string): Server[] {
  return items.map((item, index) => {
    if (!item.server?.name) {
      throw new Error(`${source} entry ${index + 1} has no server.name`);
    }
    return item.server;
  });
}

function byName(list: Server[]): Map<string, Server> {
  return new Map(list.map((server) => [server.name ?? "", server]));
}

function installTargets(server: Server): string[] {
  return [
    ...(server.remotes ?? []).map((remote) => remote.url),
    ...(server.packages ?? []).map((pkg) => pkg.identifier),
  ];
}

// Registry fields come from integrations.sh, and this output goes into PR descriptions a reviewer acts on: render
// every field as one inert table cell, never as markdown or HTML.
function text(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\\`*_[\]<>|#!~&]/g, (char) => `\\${char}`);
}

function code(value: string | undefined): string {
  const flat = (value ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|");
  const longestRun = Math.max(
    0,
    ...[...flat.matchAll(/`+/g)].map((run) => run[0].length),
  );
  const fence = "`".repeat(longestRun + 1);
  return `${fence} ${flat} ${fence}`;
}

function targetCell(server: Server): string {
  return installTargets(server)
    .map((target) => code(target))
    .join(", ");
}

// The registry API's first page of search results ranked by the CLI, as `add-mcp find <query>` shows them.
function topFindResult(
  query: string,
  registry: ServerEntry[],
  serversByName: Map<string, Server>,
): string {
  const page = queryServers(registry, { search: query, limit: "100" });
  const found = page.servers.flatMap((entry) => {
    const server = serversByName.get(entry.server.name);
    const candidate = server ? toEntry({ server }) : null;
    return candidate ? [candidate] : [];
  });
  return (
    filterSmitheryWhenAlternativesExist(rankRegistryEntries(query, found))[0]
      ?.name ?? "none"
  );
}

// What `add-mcp find --yes` writes for this entry: the CLI's own resolve path.
async function installPlan(server: Server): Promise<string> {
  const entry = toEntry({ server });
  if (!entry) return "not installable";
  const plan = await buildInstallPlanForEntry(entry, { yes: true });
  if (!plan) return "not installable";
  const parts = [`${code(plan.target)} as ${code(plan.serverName)}`];
  if (plan.transport) parts.push(plan.transport);
  const keys = [
    ...Object.keys(plan.headers ?? {}),
    ...Object.keys(plan.env ?? {}),
  ];
  if (keys.length > 0)
    parts.push(`asks for ${keys.map((key) => code(key)).join(", ")}`);
  if (plan.args) parts.push(`args ${code(plan.args.join(" "))}`);
  return parts.join("; ");
}

function changedFields(before: Server, after: Server): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (key) =>
      !isDeepStrictEqual(Reflect.get(before, key), Reflect.get(after, key)),
  );
}

async function main(): Promise<void> {
  const { base } = parseArgs(process.argv.slice(2));
  const beforeRaw = JSON.parse(
    execFileSync("git", ["show", `${base}:registry.json`], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const afterRaw = JSON.parse(await readFile("registry.json", "utf8"));
  const before = servers(beforeRaw, `${base}:registry.json`);
  const after = servers(afterRaw, "registry.json");
  const overlay = servers(
    JSON.parse(await readFile("registry.overlay.json", "utf8")),
    "registry.overlay.json",
  );

  const beforeByName = byName(before);
  const afterByName = byName(after);
  const added = after.filter((server) => !beforeByName.has(server.name ?? ""));
  const removed = before.filter(
    (server) => !afterByName.has(server.name ?? ""),
  );
  const changed = after.filter((server) => {
    const previous = beforeByName.get(server.name ?? "");
    return previous !== undefined && !isDeepStrictEqual(previous, server);
  });

  const renamed: { from: Server; to: Server }[] = [];
  for (const from of removed) {
    const targets = new Set(installTargets(from));
    const to = added.find((candidate) =>
      installTargets(candidate).some((target) => targets.has(target)),
    );
    if (to) renamed.push({ from, to });
  }
  const renamedFrom = new Set(renamed.map(({ from }) => from));
  const renamedTo = new Set(renamed.map(({ to }) => to));
  const gone = removed.filter((server) => !renamedFrom.has(server));
  const fresh = added.filter((server) => !renamedTo.has(server));

  const lines: string[] = [
    `## Registry diff against ${base}`,
    "",
    `${before.length} → ${after.length} servers: ${fresh.length} added, ${gone.length} removed, ${renamed.length} renamed, ${changed.length} changed.`,
  ];

  if (gone.length > 0) {
    lines.push(
      "",
      "### Removed",
      "",
      "| Server | Title | Install target |",
      "| --- | --- | --- |",
    );
    for (const server of gone) {
      lines.push(
        `| ${code(server.name)} | ${text(server.title)} | ${targetCell(server)} |`,
      );
    }
  }

  if (renamed.length > 0) {
    lines.push(
      "",
      "### Renamed",
      "",
      "| Before | After | `find` install before | after |",
      "| --- | --- | --- | --- |",
    );
    for (const { from, to } of renamed) {
      lines.push(
        `| ${code(from.name)} | ${code(to.name)} | ${await installPlan(from)} | ${await installPlan(to)} |`,
      );
    }
  }

  if (fresh.length > 0) {
    lines.push(
      "",
      "### Added",
      "",
      "| Server | Title | Install target |",
      "| --- | --- | --- |",
    );
    for (const server of fresh) {
      lines.push(
        `| ${code(server.name)} | ${text(server.title)} | ${targetCell(server)} |`,
      );
    }
  }

  if (changed.length > 0) {
    lines.push(
      "",
      "### Changed",
      "",
      "| Server | Fields | `find` install before | after |",
      "| --- | --- | --- | --- |",
    );
    for (const server of changed) {
      const previous = beforeByName.get(server.name ?? "");
      if (!previous) continue;
      const planBefore = await installPlan(previous);
      const planAfter = await installPlan(server);
      lines.push(
        `| ${code(server.name)} | ${changedFields(previous, server)
          .map((field) => text(field))
          .join(
            ", ",
          )} | ${planBefore} | ${planBefore === planAfter ? "unchanged" : planAfter} |`,
      );
    }
  }

  lines.push("", "### Overlay", "");
  const overlayChanges = overlay.filter((server) => {
    const previous = beforeByName.get(server.name ?? "");
    const current = afterByName.get(server.name ?? "");
    return !isDeepStrictEqual(previous, current);
  });
  lines.push(
    overlayChanges.length === 0
      ? `All ${overlay.length} overlay entries resolve as they did on ${base}.`
      : `${overlayChanges.length} of ${overlay.length} overlay entries changed: ${overlayChanges.map((server) => code(server.name)).join(", ")}.`,
  );

  lines.push(
    "",
    "### Top `find` result for popular queries",
    "",
    "| Query | Before | After |",
    "| --- | --- | --- |",
  );
  const beforeRegistry = sourceRegistrySchema.parse(beforeRaw);
  const afterRegistry = sourceRegistrySchema.parse(afterRaw);
  for (const query of POPULAR_QUERIES) {
    const was = topFindResult(query, beforeRegistry, beforeByName);
    const now = topFindResult(query, afterRegistry, afterByName);
    lines.push(
      `| ${query} | ${code(was)} | ${was === now ? "unchanged" : code(now)} |`,
    );
  }

  console.log(lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
