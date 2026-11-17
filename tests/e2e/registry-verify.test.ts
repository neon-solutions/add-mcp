#!/usr/bin/env tsx

import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
let tempDirs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    failed++;
  }
}

const testFileDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testFileDir, "..", "..");
const verifyPath = join(repoRoot, "scripts", "verify-registry.ts");
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");

function remoteEntry(name: string, title: string, url: string) {
  return {
    server: {
      name,
      title,
      description: `${title} MCP server`,
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url }],
    },
  };
}

const pinned = remoteEntry(
  "com.pinned/mcp",
  "Pinned",
  "https://mcp.pinned.dev/mcp",
);
const synced = remoteEntry(
  "com.synced/mcp",
  "Synced",
  "https://mcp.synced.dev/mcp",
);

function verify(registry: unknown[], overlay: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-registry-verify-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "registry.json"), JSON.stringify(registry));
  writeFileSync(join(dir, "registry.overlay.json"), JSON.stringify(overlay));
  const result = spawnSync(tsxBin, [verifyPath], {
    cwd: dir,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

test("passes when every overlay entry is in the registry unchanged", () => {
  const result = verify([pinned, synced], [pinned]);
  assert.strictEqual(result.status, 0, result.output);
  assert.match(
    result.output,
    /Verified 2 registry entries and 1 overlay entries/,
  );
});

test("fails when an overlay entry is missing from the registry", () => {
  const result = verify([synced], [pinned]);
  assert.strictEqual(result.status, 1, result.output);
  assert.match(
    result.output,
    /Overlay entry com\.pinned\/mcp is missing from registry\.json/,
  );
});

test("fails when the registry changed an overlay entry", () => {
  const changed = {
    server: { ...pinned.server, description: "Rewritten by a sync" },
  };
  const result = verify([changed, synced], [pinned]);
  assert.strictEqual(result.status, 1, result.output);
  assert.match(
    result.output,
    /Overlay entry com\.pinned\/mcp differs from its registry\.json entry/,
  );
});

test("fails when another entry shares an overlay entry's install target", () => {
  const duplicate = remoteEntry(
    "com.pinned.mcp/mcp",
    "Pinned Remote",
    "https://mcp.pinned.dev/mcp",
  );
  const result = verify([pinned, duplicate, synced], [pinned]);
  assert.strictEqual(result.status, 1, result.output);
  assert.match(
    result.output,
    /com\.pinned\.mcp\/mcp duplicates overlay entry com\.pinned\/mcp's install target https:\/\/mcp\.pinned\.dev\/mcp/,
  );
});

for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
tempDirs = [];
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
