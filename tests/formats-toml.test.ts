#!/usr/bin/env tsx

/**
 * Unit tests for writing and removing servers in TOML configs (Codex,
 * Grok Build) without losing what a person wrote by hand.
 *
 * Run with: npx tsx tests/formats-toml.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as TOML from "@iarna/toml";
import { removeServerFromConfig, writeConfig } from "../src/formats/index.js";

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
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-formats-toml-test-"));
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

const HAND_WRITTEN = `# my model settings
model = "o3"   # the default

# servers
[mcp_servers.other]
command = "other-server"  # keep me
args = ["--flag"]

[profiles.work]
model = "gpt"
`;

function configFile(contents: string): string {
  const filePath = join(createTempDir(), "config.toml");
  writeFileSync(filePath, contents);
  return filePath;
}

function servers(filePath: string): Record<string, Record<string, unknown>> {
  const parsed = TOML.parse(readFileSync(filePath, "utf-8"));
  return parsed.mcp_servers as Record<string, Record<string, unknown>>;
}

// ── writing ──────────────────────────────────────────────────────────────

test("TOML write: keeps comments and existing tables when adding a server", () => {
  const filePath = configFile(HAND_WRITTEN);

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node", args: ["server.js"] } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.startsWith(HAND_WRITTEN), content);
  assert.ok(content.includes("# keep me"));
  assert.deepStrictEqual(servers(filePath).demo, {
    command: "node",
    args: ["server.js"],
  });
  assert.strictEqual(servers(filePath).other?.command, "other-server");
});

test("TOML write: adds a new server as its own table", () => {
  const filePath = configFile(HAND_WRITTEN);

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node", env: { KEY: "v" } } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.includes("\n[mcp_servers.demo]\n"), content);
  assert.ok(!content.includes("mcp_servers.demo ="), content);
});

test("TOML write: updates an existing server in place", () => {
  const filePath = configFile(HAND_WRITTEN);

  writeConfig(
    filePath,
    { mcp_servers: { other: { command: "new-server", args: ["--flag"] } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.includes("# my model settings"));
  assert.ok(content.includes('model = "o3"   # the default'));
  assert.ok(
    content.indexOf("[mcp_servers.other]") < content.indexOf("[profiles.work]"),
    "the table keeps its place",
  );
  assert.strictEqual(servers(filePath).other?.command, "new-server");
});

test("TOML write: quotes a server name that is not a bare key", () => {
  const filePath = configFile(HAND_WRITTEN);

  writeConfig(
    filePath,
    { mcp_servers: { "my server": { command: "node" } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.includes('[mcp_servers."my server"]'), content);
  assert.strictEqual(servers(filePath)["my server"]?.command, "node");
});

test("TOML write: servers kept as one inline table still get a valid file", () => {
  const filePath = configFile(
    '# inline\nmcp_servers = { other = { command = "other-server" } }\n',
  );

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node" } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.includes("# inline"));
  assert.strictEqual(servers(filePath).demo?.command, "node");
  assert.strictEqual(servers(filePath).other?.command, "other-server");
});

test("TOML write: creates a new file with the server table", () => {
  const filePath = join(createTempDir(), "nested", "config.toml");

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node", args: ["x"] } } },
    "toml",
    "mcp_servers",
  );

  assert.deepStrictEqual(servers(filePath).demo, {
    command: "node",
    args: ["x"],
  });
});

test("TOML write: keeps CRLF line endings in a Windows file", () => {
  const original = HAND_WRITTEN.replace(/\n/g, "\r\n");
  const filePath = configFile(original);

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node", args: ["server.js"] } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.startsWith(original), content);
  assert.ok(!/(?<!\r)\n/.test(content), "every line ends with CRLF");
  assert.ok(content.includes("[mcp_servers.demo]\r\n"), content);
});

test("TOML write: keeps blank lines at the end of the file", () => {
  const original = `${HAND_WRITTEN}\n\n`;
  const filePath = configFile(original);

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node" } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.startsWith(original), content);
  assert.ok(content.includes("\n[mcp_servers.demo]\n"), content);
});

test("TOML write: a large integer elsewhere does not change the layout", () => {
  const filePath = configFile(`big = 9007199254740993\n\n${HAND_WRITTEN}`);

  writeConfig(
    filePath,
    { mcp_servers: { demo: { command: "node" } } },
    "toml",
    "mcp_servers",
  );

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.includes("big = 9007199254740993"), content);
  assert.ok(content.includes("\n[mcp_servers.demo]\n"), content);
  assert.ok(!content.includes("mcp_servers.demo ="), content);
});

// ── removing ─────────────────────────────────────────────────────────────

test("TOML remove: keeps comments and every other table", () => {
  const filePath = configFile(
    HAND_WRITTEN + '\n[mcp_servers.demo]\ncommand = "node"\n',
  );

  removeServerFromConfig(filePath, "toml", "mcp_servers", "demo");

  const content = readFileSync(filePath, "utf-8");
  assert.ok(content.includes("# my model settings"));
  assert.ok(content.includes("# keep me"));
  assert.ok(!content.includes("[mcp_servers.demo]"), content);
  assert.strictEqual(servers(filePath).demo, undefined);
  assert.strictEqual(servers(filePath).other?.command, "other-server");
});

// ── cleanup ──────────────────────────────────────────────────────────────

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
