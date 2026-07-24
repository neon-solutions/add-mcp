#!/usr/bin/env tsx

/**
 * Unit tests for reader.ts
 *
 * Run with: npx tsx tests/reader.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractServerIdentity,
  readServersForAgent,
  findMatchingServers,
  type AgentServers,
  type InstalledServer,
} from "../src/reader.js";
import { agents } from "../src/agents.js";

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
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-reader-test-"));
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

// ── extractServerIdentity ────────────────────────────────────────────────

test("extractServerIdentity: standard url field", () => {
  const identity = extractServerIdentity({
    url: "https://mcp.example.com/mcp",
    type: "http",
  });
  assert.strictEqual(identity, "https://mcp.example.com/mcp");
});

test("extractServerIdentity: Goose uri field", () => {
  const identity = extractServerIdentity({
    name: "neon",
    type: "streamable_http",
    uri: "https://mcp.neon.tech/mcp",
    headers: {},
    enabled: true,
    timeout: 300,
  });
  assert.strictEqual(identity, "https://mcp.neon.tech/mcp");
});

test("extractServerIdentity: Antigravity serverUrl field", () => {
  const identity = extractServerIdentity({
    serverUrl: "https://mcp.example.com/api",
  });
  assert.strictEqual(identity, "https://mcp.example.com/api");
});

test("extractServerIdentity: Gemini CLI httpUrl field", () => {
  const identity = extractServerIdentity({
    httpUrl: "https://mcp.context7.com/mcp",
    headers: { CONTEXT7_API_KEY: "test" },
  });
  assert.strictEqual(identity, "https://mcp.context7.com/mcp");
});

test("extractServerIdentity: Gemini CLI httpUrl takes priority over url", () => {
  const identity = extractServerIdentity({
    httpUrl: "https://legacy.example.com/mcp",
    url: "https://new.example.com/mcp",
    type: "http",
  });
  assert.strictEqual(identity, "https://legacy.example.com/mcp");
});

test("extractServerIdentity: npx package detection", () => {
  const identity = extractServerIdentity({
    command: "npx",
    args: ["-y", "@neondatabase/mcp-server-neon"],
  });
  assert.strictEqual(identity, "@neondatabase/mcp-server-neon");
});

test("extractServerIdentity: npx without -y flag", () => {
  const identity = extractServerIdentity({
    command: "npx",
    args: ["@org/server"],
  });
  assert.strictEqual(identity, "@org/server");
});

test("extractServerIdentity: bunx package detection", () => {
  const identity = extractServerIdentity({
    command: "bunx",
    args: ["-y", "mcp-server-github"],
  });
  assert.strictEqual(identity, "mcp-server-github");
});

test("extractServerIdentity: full command identity", () => {
  const identity = extractServerIdentity({
    command: "node",
    args: ["/path/to/server.js", "--port", "3000"],
  });
  assert.strictEqual(identity, "node /path/to/server.js --port 3000");
});

test("extractServerIdentity: command only, no args", () => {
  const identity = extractServerIdentity({
    command: "my-server",
  });
  assert.strictEqual(identity, "my-server");
});

test("extractServerIdentity: empty config returns empty string", () => {
  const identity = extractServerIdentity({});
  assert.strictEqual(identity, "");
});

test("extractServerIdentity: prefers url over command", () => {
  const identity = extractServerIdentity({
    url: "https://example.com/mcp",
    command: "npx",
    args: ["-y", "some-package"],
  });
  assert.strictEqual(identity, "https://example.com/mcp");
});

test("extractServerIdentity: OpenCode array command with npx -y package", () => {
  const identity = extractServerIdentity({
    type: "local",
    command: ["npx", "-y", "mcp-server-postgres"],
    enabled: true,
    environment: {},
  });
  assert.strictEqual(identity, "mcp-server-postgres");
});

test("extractServerIdentity: OpenCode array command with bunx package", () => {
  const identity = extractServerIdentity({
    type: "local",
    command: ["bunx", "-y", "@org/mcp-server"],
    enabled: true,
  });
  assert.strictEqual(identity, "@org/mcp-server");
});

test("extractServerIdentity: OpenCode array command without package manager", () => {
  const identity = extractServerIdentity({
    type: "local",
    command: ["node", "server.js", "--port", "3000"],
    enabled: true,
  });
  assert.strictEqual(identity, "node server.js --port 3000");
});

test("extractServerIdentity: OpenCode array command with single entry", () => {
  const identity = extractServerIdentity({
    type: "local",
    command: ["my-server"],
    enabled: true,
  });
  assert.strictEqual(identity, "my-server");
});

// ── readServersForAgent ──────────────────────────────────────────────────

test("readServersForAgent: reads JSON config for cursor", () => {
  const tempDir = createTempDir();
  const cursorDir = join(tempDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        neon: { url: "https://mcp.neon.tech/mcp" },
        github: { command: "npx", args: ["-y", "mcp-server-github"] },
      },
    }),
  );

  const result = readServersForAgent("cursor", {
    scope: "local",
    cwd: tempDir,
  });

  assert.strictEqual(result.agentType, "cursor");
  assert.strictEqual(result.displayName, "Cursor");
  assert.strictEqual(result.servers.length, 2);

  const neon = result.servers.find((s) => s.serverName === "neon");
  assert.ok(neon);
  assert.strictEqual(neon.identity, "https://mcp.neon.tech/mcp");

  const github = result.servers.find((s) => s.serverName === "github");
  assert.ok(github);
  assert.strictEqual(github.identity, "mcp-server-github");
});

test("readServersForAgent: returns empty servers for missing config", () => {
  const tempDir = createTempDir();

  const result = readServersForAgent("cursor", {
    scope: "local",
    cwd: tempDir,
  });

  assert.strictEqual(result.servers.length, 0);
});

test("readServersForAgent: reads from claude-code .mcp.json", () => {
  const tempDir = createTempDir();
  writeFileSync(
    join(tempDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }),
  );

  const result = readServersForAgent("claude-code", {
    scope: "local",
    cwd: tempDir,
  });

  assert.strictEqual(result.servers.length, 1);
  assert.strictEqual(result.servers[0]!.serverName, "context7");
  assert.strictEqual(
    result.servers[0]!.identity,
    "https://mcp.context7.com/mcp",
  );
});

test("readServersForAgent: reads VS Code config with 'servers' key", () => {
  const tempDir = createTempDir();
  const vscodeDir = join(tempDir, ".vscode");
  mkdirSync(vscodeDir, { recursive: true });
  writeFileSync(
    join(vscodeDir, "mcp.json"),
    JSON.stringify({
      servers: {
        myserver: { url: "https://example.com/mcp" },
      },
    }),
  );

  const result = readServersForAgent("vscode", {
    scope: "local",
    cwd: tempDir,
  });

  assert.strictEqual(result.servers.length, 1);
  assert.strictEqual(result.servers[0]!.serverName, "myserver");
});

test("readServersForAgent: reads OpenCode local array command identity", () => {
  const tempDir = createTempDir();
  writeFileSync(
    join(tempDir, "opencode.json"),
    JSON.stringify({
      mcp: {
        postgres: {
          type: "local",
          command: ["npx", "-y", "mcp-server-postgres"],
          enabled: true,
          environment: { DATABASE_URL: "postgres://localhost/db" },
        },
      },
    }),
  );

  const result = readServersForAgent("opencode", {
    scope: "local",
    cwd: tempDir,
  });

  assert.strictEqual(result.servers.length, 1);
  assert.strictEqual(result.servers[0]!.serverName, "postgres");
  assert.strictEqual(result.servers[0]!.identity, "mcp-server-postgres");
});

// ── findMatchingServers ──────────────────────────────────────────────────

function makeAgentServers(
  agentType: string,
  servers: Array<{ name: string; identity: string }>,
): AgentServers {
  return {
    agentType: agentType as any,
    displayName: agentType,
    detected: true,
    scope: "local",
    configPath: "/fake/path",
    servers: servers.map((s) => ({
      serverName: s.name,
      config: {},
      identity: s.identity,
      agentType: agentType as any,
      scope: "local" as const,
      configPath: "/fake/path",
    })),
  };
}

test("findMatchingServers: matches by exact server name", () => {
  const list = [
    makeAgentServers("cursor", [
      { name: "neon", identity: "https://mcp.neon.tech/mcp" },
    ]),
  ];
  const matches = findMatchingServers(list, "neon");
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0]!.serverName, "neon");
});

test("findMatchingServers: matches by case-insensitive substring on name", () => {
  const list = [
    makeAgentServers("cursor", [
      { name: "neon-mcp", identity: "https://mcp.neon.tech/mcp" },
    ]),
  ];
  const matches = findMatchingServers(list, "Neon");
  assert.strictEqual(matches.length, 1);
});

test("findMatchingServers: matches by exact URL identity", () => {
  const list = [
    makeAgentServers("cursor", [
      { name: "my-server", identity: "https://mcp.neon.tech/mcp" },
    ]),
  ];
  const matches = findMatchingServers(list, "https://mcp.neon.tech/mcp");
  assert.strictEqual(matches.length, 1);
});

test("findMatchingServers: matches by package name identity", () => {
  const list = [
    makeAgentServers("cursor", [
      { name: "github", identity: "@modelcontextprotocol/server-github" },
    ]),
  ];
  const matches = findMatchingServers(
    list,
    "@modelcontextprotocol/server-github",
  );
  assert.strictEqual(matches.length, 1);
});

test("findMatchingServers: returns empty array for no matches", () => {
  const list = [
    makeAgentServers("cursor", [
      { name: "neon", identity: "https://mcp.neon.tech/mcp" },
    ]),
  ];
  const matches = findMatchingServers(list, "nonexistent");
  assert.strictEqual(matches.length, 0);
});

test("findMatchingServers: finds matches across multiple agents", () => {
  const list = [
    makeAgentServers("cursor", [
      { name: "neon", identity: "https://mcp.neon.tech/mcp" },
    ]),
    makeAgentServers("claude-code", [
      { name: "neon-mcp", identity: "https://mcp.neon.tech/mcp" },
    ]),
  ];
  const matches = findMatchingServers(list, "neon");
  assert.strictEqual(matches.length, 2);
});

// ── cleanup ──────────────────────────────────────────────────────────────

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
