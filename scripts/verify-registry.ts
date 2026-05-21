#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const REGISTRY_PATH = path.resolve(process.cwd(), "registry.json");

const registryVariableSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    format: z.string().optional(),
    default: z.string().optional(),
    choices: z.array(z.string()).optional(),
  })
  .passthrough();

const registryHeaderSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    format: z.string().optional(),
    default: z.string().optional(),
  })
  .passthrough();

const registryRemoteSchema = z
  .object({
    type: z.enum(["streamable-http", "sse"]),
    url: z.string().url(),
    variables: z.record(z.string(), registryVariableSchema).optional(),
    headers: z.array(registryHeaderSchema).optional(),
  })
  .passthrough();

const registryPackageSchema = z
  .object({
    registryType: z.enum(["npm", "pypi", "oci", "nuget", "mcpb"]),
    identifier: z.string().min(1),
    registryBaseUrl: z.string().url().optional(),
    version: z.string().optional(),
    runtimeHint: z.string().optional(),
    environmentVariables: z.array(registryVariableSchema).optional(),
    transport: z
      .object({
        type: z.literal("stdio"),
      })
      .passthrough(),
  })
  .passthrough();

const registryServerSchema = z
  .object({
    $schema: z.string().url().optional(),
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    repository: z
      .object({
        url: z.string().url(),
        source: z.string().optional(),
        subfolder: z.string().optional(),
      })
      .passthrough()
      .optional(),
    repositoryUrl: z.string().url().optional(),
    websiteUrl: z.string().url().optional(),
    icons: z.array(z.record(z.string(), z.unknown())).optional(),
    remotes: z.array(registryRemoteSchema).optional(),
    packages: z.array(registryPackageSchema).optional(),
  })
  .passthrough();

type RegistryServerEntry = z.infer<typeof registryServerSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractServerCandidate(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  return "server" in value ? value.server : value;
}

function hasAnyInstallTarget(entry: RegistryServerEntry): boolean {
  return (entry.remotes?.length ?? 0) > 0 || (entry.packages?.length ?? 0) > 0;
}

function compareEntries(
  a: RegistryServerEntry,
  b: RegistryServerEntry,
): number {
  const titleDiff = a.title.localeCompare(b.title, undefined, {
    sensitivity: "base",
  });
  if (titleDiff !== 0) return titleDiff;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function sameOrder(
  a: RegistryServerEntry[],
  b: RegistryServerEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.title !== right.title || left.name !== right.name) {
      return false;
    }
  }
  return true;
}

function parseEntries(root: unknown): unknown[] {
  if (Array.isArray(root)) {
    return root;
  }
  if (isRecord(root) && Array.isArray(root.servers)) {
    return root.servers;
  }
  throw new Error(
    "registry.json must be either an array of entries or an object with a 'servers' array",
  );
}

async function main(): Promise<void> {
  const raw = await readFile(REGISTRY_PATH, "utf8");
  const parsedRoot: unknown = JSON.parse(raw);
  const rawEntries = parseEntries(parsedRoot);

  const issues: string[] = [];
  const parsedEntries: RegistryServerEntry[] = [];

  rawEntries.forEach((rawEntry, index) => {
    const parsed = registryServerSchema.safeParse(
      extractServerCandidate(rawEntry),
    );
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `${where}: ${issue.message}`;
        })
        .join("; ");
      issues.push(`Entry ${index + 1} is invalid (${details})`);
      return;
    }
    if (!hasAnyInstallTarget(parsed.data)) {
      issues.push(
        `Entry ${index + 1} is invalid (must include at least one remote or package target)`,
      );
      return;
    }
    parsedEntries.push(parsed.data);
  });

  const sortedEntries = [...parsedEntries].sort(compareEntries);
  if (!sameOrder(parsedEntries, sortedEntries)) {
    const firstMismatch = parsedEntries.findIndex((entry, index) => {
      const sorted = sortedEntries[index];
      return (
        !sorted || entry.title !== sorted.title || entry.name !== sorted.name
      );
    });
    const current = parsedEntries[firstMismatch];
    const expected = sortedEntries[firstMismatch];
    issues.push(
      `Registry entries are not sorted by title at position ${firstMismatch + 1}: ` +
        `found "${current?.title ?? "unknown"}" but expected "${expected?.title ?? "unknown"}"`,
    );
  }

  if (issues.length > 0) {
    console.error("Registry verification failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    console.error("Run `bun run registry:sort` to fix ordering.");
    process.exit(1);
  }

  console.log(`Verified ${parsedEntries.length} registry entries`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Failed to verify registry.json";
  console.error(message);
  process.exit(1);
});
