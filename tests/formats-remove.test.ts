#!/usr/bin/env tsx

/**
 * Unit tests for removeServerFromConfig across JSON, YAML, and TOML formats.
 *
 * Run with: npx tsx tests/formats-remove.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as jsonc from "jsonc-parser";
import yaml from "js-yaml";
import * as TOML from "@iarna/toml";
import { removeServerFromConfig } from "../src/formats/index.js";

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

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-formats-remove-test-"));
  tempDirs.push(dir);
  return dir;
}

function cleanup() {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs = [];
}

// ── JSON removal ─────────────────────────────────────────────────────────

test("JSON: removes server key, preserves other keys", () => {
  const dir = createTempDir();
  const filePath = join(dir, "mcp.json");
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        mcpServers: {
          neon: { url: "https://mcp.neon.tech/mcp" },
          github: { command: "npx", args: ["-y", "mcp-server-github"] },
        },
      },
      null,
      2,
    ),
  );

  removeServerFromConfig(filePath, "json", "mcpServers", "neon");

  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  assert.strictEqual(parsed.mcpServers.neon, undefined);
  assert.ok(parsed.mcpServers.github);
  assert.strictEqual(parsed.mcpServers.github.command, "npx");
});

test("JSON: removing last server leaves empty servers object", () => {
  const dir = createTempDir();
  const filePath = join(dir, "mcp.json");
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        mcpServers: {
          neon: { url: "https://mcp.neon.tech/mcp" },
        },
      },
      null,
      2,
    ),
  );

  removeServerFromConfig(filePath, "json", "mcpServers", "neon");

  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  assert.deepStrictEqual(parsed.mcpServers, {});
});

test("JSON: preserves comments in JSONC files", () => {
  const dir = createTempDir();
  const filePath = join(dir, "mcp.json");
  const jsoncContent = `{
  // This is a comment
  "mcpServers": {
    "neon": { "url": "https://mcp.neon.tech/mcp" },
    "github": { "url": "https://github.com/mcp" }
  }
}`;
  writeFileSync(filePath, jsoncContent);

  removeServerFromConfig(filePath, "json", "mcpServers", "neon");

  const content = readFileSync(filePath, "utf-8");
  assert.ok(
    content.includes("// This is a comment"),
    "Comment should be preserved",
  );
  const parsed = jsonc.parse(content);
  assert.strictEqual(parsed.mcpServers.neon, undefined);
  assert.ok(parsed.mcpServers.github);
});

test("JSON: no-op on nonexistent file", () => {
  const dir = createTempDir();
  const filePath = join(dir, "nonexistent.json");
  // Should not throw
  removeServerFromConfig(filePath, "json", "mcpServers", "neon");
});

test("JSON: no-op when server name not found", () => {
  const dir = createTempDir();
  const filePath = join(dir, "mcp.json");
  const original = JSON.stringify(
    { mcpServers: { github: { url: "https://github.com/mcp" } } },
    null,
    2,
  );
  writeFileSync(filePath, original);

  removeServerFromConfig(filePath, "json", "mcpServers", "neon");

  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  assert.ok(parsed.mcpServers.github);
});

// ── YAML removal ─────────────────────────────────────────────────────────

test("YAML: removes server key from nested config", () => {
  const dir = createTempDir();
  const filePath = join(dir, "config.yaml");
  const yamlContent = yaml.dump({
    extensions: {
      neon: {
        name: "neon",
        type: "streamable_http",
        uri: "https://mcp.neon.tech/mcp",
      },
      github: {
        name: "github",
        type: "stdio",
        cmd: "npx",
      },
    },
  });
  writeFileSync(filePath, yamlContent);

  removeServerFromConfig(filePath, "yaml", "extensions", "neon");

  const content = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(content) as Record<string, unknown>;
  const extensions = parsed.extensions as Record<string, unknown>;
  assert.strictEqual(extensions.neon, undefined);
  assert.ok(extensions.github);
});

test("removeServerFromConfig - YAML removes from an aliased server map", () => {
  const dir = createTempDir();
  const filePath = join(dir, "config.yaml");
  writeFileSync(
    filePath,
    "shared: &servers\n  keep:\n    cmd: a\n  drop:\n    cmd: b\nextensions: *servers\n",
  );

  removeServerFromConfig(filePath, "yaml", "extensions", "drop");

  const parsed = yaml.load(readFileSync(filePath, "utf-8")) as Record<
    string,
    unknown
  >;
  assert.deepStrictEqual(parsed.extensions, { keep: { cmd: "a" } });
  assert.deepStrictEqual(parsed.shared, {
    keep: { cmd: "a" },
    drop: { cmd: "b" },
  });
});

test("removeServerFromConfig - YAML keeps comments", () => {
  const dir = createTempDir();
  const filePath = join(dir, "config.yaml");
  writeFileSync(
    filePath,
    [
      "# top comment",
      "mcp_servers:",
      "  keep: # stays",
      "    url: https://keep.example.com/mcp",
      "  drop:",
      "    url: https://drop.example.com/mcp",
      "",
    ].join("\n"),
  );

  removeServerFromConfig(filePath, "yaml", "mcp_servers", "drop");

  const content = readFileSync(filePath, "utf-8");
  assert.match(content, /^# top comment$/m);
  assert.match(content, /# stays/);
  const parsed = yaml.load(content) as Record<string, unknown>;
  assert.deepStrictEqual(parsed.mcp_servers, {
    keep: { url: "https://keep.example.com/mcp" },
  });
});

test("YAML: no-op on nonexistent file", () => {
  const dir = createTempDir();
  const filePath = join(dir, "nonexistent.yaml");
  removeServerFromConfig(filePath, "yaml", "extensions", "neon");
});

// ── TOML removal ─────────────────────────────────────────────────────────

test("TOML: removes server key from nested config", () => {
  const dir = createTempDir();
  const filePath = join(dir, "config.toml");
  const tomlContent = TOML.stringify({
    mcp_servers: {
      neon: { type: "http", url: "https://mcp.neon.tech/mcp" },
      github: { command: "npx", args: ["-y", "mcp-server-github"] },
    },
  } as TOML.JsonMap);
  writeFileSync(filePath, tomlContent);

  removeServerFromConfig(filePath, "toml", "mcp_servers", "neon");

  const content = readFileSync(filePath, "utf-8");
  const parsed = TOML.parse(content);
  assert.strictEqual(
    (parsed.mcp_servers as Record<string, unknown>).neon,
    undefined,
  );
  assert.ok((parsed.mcp_servers as Record<string, unknown>).github);
});

test("TOML: no-op on nonexistent file", () => {
  const dir = createTempDir();
  const filePath = join(dir, "nonexistent.toml");
  removeServerFromConfig(filePath, "toml", "mcp_servers", "neon");
});

// ── cleanup ──────────────────────────────────────────────────────────────

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
