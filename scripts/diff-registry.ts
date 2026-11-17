#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import {
  buildInstallPlanForEntry,
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

function cell(value: string | undefined): string {
  return (value ?? "").replace(/\|/g, "\\|");
}

function targetCell(server: Server): string {
  return installTargets(server)
    .map((target) => `\`${cell(target)}\``)
    .join(", ");
}

function entries(list: Server[]): RegistryServerEntry[] {
  return list
    .map((server) => toEntry({ server }))
    .filter((entry): entry is RegistryServerEntry => entry !== null);
}

// What `add-mcp find --yes` writes for this entry: the CLI's own resolve path.
async function installPlan(server: Server): Promise<string> {
  const entry = toEntry({ server });
  if (!entry) return "not installable";
  const plan = await buildInstallPlanForEntry(entry, { yes: true });
  if (!plan) return "not installable";
  const parts = [`\`${cell(plan.target)}\` as \`${cell(plan.serverName)}\``];
  if (plan.transport) parts.push(plan.transport);
  const keys = [
    ...Object.keys(plan.headers ?? {}),
    ...Object.keys(plan.env ?? {}),
  ];
  if (keys.length > 0) parts.push(`asks for ${keys.join(", ")}`);
  if (plan.args) parts.push(`args ${plan.args.join(" ")}`);
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
  const before = servers(
    JSON.parse(
      execFileSync("git", ["show", `${base}:registry.json`], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      }),
    ),
    `${base}:registry.json`,
  );
  const after = servers(
    JSON.parse(await readFile("registry.json", "utf8")),
    "registry.json",
  );
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
        `| \`${cell(server.name)}\` | ${cell(server.title)} | ${targetCell(server)} |`,
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
        `| \`${cell(from.name)}\` | \`${cell(to.name)}\` | ${await installPlan(from)} | ${await installPlan(to)} |`,
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
        `| \`${cell(server.name)}\` | ${cell(server.title)} | ${targetCell(server)} |`,
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
        `| \`${cell(server.name)}\` | ${changedFields(previous, server).join(", ")} | ${planBefore} | ${planBefore === planAfter ? "unchanged" : planAfter} |`,
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
      : `${overlayChanges.length} of ${overlay.length} overlay entries changed: ${overlayChanges.map((server) => `\`${cell(server.name)}\``).join(", ")}.`,
  );

  lines.push(
    "",
    "### Top `find` result for popular queries",
    "",
    "| Query | Before | After |",
    "| --- | --- | --- |",
  );
  const beforeEntries = entries(before);
  const afterEntries = entries(after);
  for (const query of POPULAR_QUERIES) {
    const top = (list: RegistryServerEntry[]) =>
      rankRegistryEntries(query, list)[0]?.name ?? "none";
    const was = top(beforeEntries);
    const now = top(afterEntries);
    lines.push(
      `| ${query} | \`${was}\` | ${was === now ? "unchanged" : `\`${now}\``} |`,
    );
  }

  console.log(lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
