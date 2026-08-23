#!/usr/bin/env tsx

/**
 * Unit tests for lib.ts (programmatic API)
 *
 * Run with: npx tsx tests/lib.test.ts
 */

import assert from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectProjectAgents,
  detectGlobalAgents,
  upsertServer,
  removeServer,
  listInstalledServers,
  getAgentTypes,
  type McpServerConfig,
} from "../src/lib.js";
import { invalidBearerTokenEnvMessage } from "../src/schema.js";

const remote = (url: string): McpServerConfig => ({ type: "http", url });
const pkg = (name: string): McpServerConfig => ({
  command: "npx",
  args: ["-y", name],
});

let passed = 0;
let failed = 0;
let tempDirs: string[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  const run = async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${name}`);
      console.error(`  ${(err as Error).message}`);
      failed++;
    }
  };
  return run();
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-lib-test-"));
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

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

await test("detectProjectAgents finds cursor when .cursor exists", () => {
  const dir = createTempDir();
  mkdirSync(join(dir, ".cursor"), { recursive: true });
  mkdirSync(join(dir, ".vscode"), { recursive: true });

  const detected = detectProjectAgents(dir);
  assert.ok(
    detected.includes("cursor"),
    `expected cursor in ${detected.join(", ")}`,
  );
  assert.ok(
    detected.includes("vscode"),
    `expected vscode in ${detected.join(", ")}`,
  );
});

await test("detectProjectAgents returns empty for clean dir", () => {
  const dir = createTempDir();
  const detected = detectProjectAgents(dir);
  assert.deepStrictEqual(detected, []);
});

await test("detectGlobalAgents returns an array of known agents", async () => {
  const detected = await detectGlobalAgents();
  assert.ok(Array.isArray(detected));
  const known = new Set(getAgentTypes());
  for (const agent of detected) {
    assert.ok(known.has(agent), `${agent} should be a known AgentType`);
  }
});

await test("upsertServer writes a remote server config", () => {
  const dir = createTempDir();
  const result = upsertServer(
    "cursor",
    "example",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );

  assert.ok(result.success, result.error);
  assert.ok(result.path.includes(dir));

  const written = readJson(join(dir, ".cursor", "mcp.json"));
  const servers = written.mcpServers as Record<string, unknown>;
  assert.ok(servers.example, "server should be present");
  const exampleConfig = servers.example as Record<string, unknown>;
  assert.strictEqual(exampleConfig.url, "https://mcp.example.com/api");
});

await test("upsertServer updates an existing server in place", () => {
  const dir = createTempDir();

  const first = upsertServer(
    "cursor",
    "demo",
    remote("https://old.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(first.success);

  const second = upsertServer(
    "cursor",
    "demo",
    remote("https://new.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(second.success);

  const written = readJson(join(dir, ".cursor", "mcp.json"));
  const demo = (written.mcpServers as Record<string, Record<string, unknown>>)
    .demo;
  assert.strictEqual(demo!.url, "https://new.example.com/api");
});

await test("listInstalledServers lists what upsertServer wrote", async () => {
  const dir = createTempDir();
  upsertServer("cursor", "listed", pkg("mcp-server-postgres"), {
    local: true,
    cwd: dir,
  });

  const list = await listInstalledServers({ cwd: dir });
  const cursor = list.find((a) => a.agentType === "cursor");
  assert.ok(cursor, "cursor should be detected");
  const names = cursor!.servers.map((s) => s.serverName);
  assert.ok(
    names.includes("listed"),
    `expected 'listed' in ${names.join(", ")}`,
  );
});

await test("removeServer deletes an existing server", () => {
  const dir = createTempDir();
  upsertServer("cursor", "doomed", remote("https://x.example.com"), {
    local: true,
    cwd: dir,
  });

  const result = removeServer("cursor", "doomed", { local: true, cwd: dir });
  assert.ok(result.success);
  assert.strictEqual(result.removed, true);

  const written = readJson(join(dir, ".cursor", "mcp.json"));
  const servers = (written.mcpServers ?? {}) as Record<string, unknown>;
  assert.ok(!servers.doomed, "doomed should be gone");
});

await test("removeServer returns removed=false when server is absent", () => {
  const dir = createTempDir();
  upsertServer("cursor", "kept", remote("https://k.example.com"), {
    local: true,
    cwd: dir,
  });

  const result = removeServer("cursor", "missing", {
    local: true,
    cwd: dir,
  });
  assert.ok(result.success);
  assert.strictEqual(result.removed, false);

  // The unrelated server should still be there.
  const written = readJson(join(dir, ".cursor", "mcp.json"));
  const servers = written.mcpServers as Record<string, unknown>;
  assert.ok(servers.kept);
});

await test("removeServer returns removed=false when no config file exists", () => {
  const dir = createTempDir();
  const result = removeServer("cursor", "ghost", { local: true, cwd: dir });
  assert.ok(result.success);
  assert.strictEqual(result.removed, false);
  assert.strictEqual(existsSync(join(dir, ".cursor", "mcp.json")), false);
});

await test("upsertServer returns error result for unknown agent type", () => {
  const dir = createTempDir();
  const result = upsertServer(
    "not-a-real-agent",
    "x",
    remote("https://x.example.com"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes("Unknown agent type"));
});

await test("removeServer returns error result for unknown agent type", () => {
  const result = removeServer("not-a-real-agent", "x");
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.removed, false);
  assert.ok(result.error?.includes("Unknown agent type"));
});

await test("upsertServer + removeServer reject local: true for global-only agents", () => {
  const dir = createTempDir();
  const upsert = upsertServer(
    "claude-desktop",
    "x",
    remote("https://x.example.com"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(upsert.success, false);
  assert.ok(upsert.error?.includes("does not support project-level"));

  const remove = removeServer("claude-desktop", "x", {
    local: true,
    cwd: dir,
  });
  assert.strictEqual(remove.success, false);
  assert.strictEqual(remove.removed, false);
  assert.ok(remove.error?.includes("does not support project-level"));

  const fxUpsert = upsertServer("fx", "x", remote("https://x.example.com"), {
    local: true,
    cwd: dir,
  });
  assert.strictEqual(fxUpsert.success, false);
  assert.ok(fxUpsert.error?.includes("does not support project-level"));
});

await test("upsertServer trims padded bearerTokenEnv and does not leak it to an unsupported local agent", () => {
  const dir = createTempDir();
  const result = upsertServer(
    "github-copilot-cli",
    "example",
    {
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer token" },
      bearerTokenEnv: "  NEON_API_KEY  ",
    },
    { local: true, cwd: dir },
  );

  assert.ok(result.success, result.error);
  assert.deepStrictEqual(result.droppedFields, ["bearerTokenEnv"]);

  const written = readJson(join(dir, ".vscode", "mcp.json"));
  const server = (written.servers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.strictEqual("bearerTokenEnv" in server, false);
  assert.strictEqual("bearer_token_env" in server, false);
  assert.deepStrictEqual(server.headers, { Authorization: "Bearer token" });
});

await test("upsertServer rejects whitespace-only bearerTokenEnv and writes nothing", () => {
  const dir = createTempDir();
  const result = upsertServer(
    "github-copilot-cli",
    "example",
    {
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer token" },
      bearerTokenEnv: "   ",
    },
    { local: true, cwd: dir },
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, invalidBearerTokenEnvMessage("   "));
  assert.strictEqual(existsSync(join(dir, ".vscode", "mcp.json")), false);
});

await test("upsertServer rejects a bearerTokenEnv that is not an env var name", () => {
  const dir = createTempDir();
  const result = upsertServer(
    "github-copilot-cli",
    "example",
    {
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer token" },
      bearerTokenEnv: "Bearer sk-live",
    },
    { local: true, cwd: dir },
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(
    result.error,
    invalidBearerTokenEnvMessage("Bearer sk-live"),
  );
  assert.strictEqual(existsSync(join(dir, ".vscode", "mcp.json")), false);
});

await test("upsertServer + removeServer honor github-copilot-cli local `servers` key", () => {
  const dir = createTempDir();

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);

  const written = readJson(join(dir, ".vscode", "mcp.json"));
  // Local copilot config uses `servers`, not `mcpServers`.
  assert.ok(
    written.servers && (written.servers as Record<string, unknown>).ghc,
    "expected `servers.ghc` under local github-copilot-cli config",
  );
  assert.strictEqual(
    written.mcpServers,
    undefined,
    "expected no `mcpServers` key under local copilot config",
  );

  const removed = removeServer("github-copilot-cli", "ghc", {
    local: true,
    cwd: dir,
  });
  assert.ok(removed.success);
  assert.strictEqual(removed.removed, true);

  const after = readJson(join(dir, ".vscode", "mcp.json"));
  const servers = (after.servers ?? {}) as Record<string, unknown>;
  assert.ok(!servers.ghc, "ghc should be removed from local servers key");
});

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
