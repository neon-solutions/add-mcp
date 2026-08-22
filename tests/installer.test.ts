#!/usr/bin/env tsx

/**
 * Unit tests for installer.ts
 *
 * Run with: npx tsx tests/installer.test.ts
 */

import assert from "node:assert";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildServerConfig,
  installServer,
  installServerForAgent,
  updateGitignoreWithPaths,
} from "../src/installer.js";
import { agents } from "../src/agents.js";
import { parseSource } from "../src/source-parser.js";
import { applyFieldSupport } from "../src/schema.js";
import * as TOML from "@iarna/toml";
import type { AgentType } from "../src/types.js";

let passed = 0;
let failed = 0;
let tempDirs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`\u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`\u2717 ${name}`);
    console.error(`  ${(err as Error).message}`);
    failed++;
  }
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-installer-test-"));
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

function readJsonConfig(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

function readTomlConfig(filePath: string): Record<string, unknown> {
  return TOML.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

// buildServerConfig tests - Remote
test("buildServerConfig - remote URL defaults to http", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.type, "http");
  assert.strictEqual(config.url, "https://mcp.example.com/api");
  assert.strictEqual(config.command, undefined);
});

test("buildServerConfig - remote URL with headers", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed, {
    headers: {
      Authorization: "Bearer token",
      "X-Custom": "value",
    },
  });

  assert.deepStrictEqual(config.headers, {
    Authorization: "Bearer token",
    "X-Custom": "value",
  });
});

test("buildServerConfig - remote URL with path", () => {
  const parsed = parseSource("https://api.company.com/mcp/v1");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.type, "http");
  assert.strictEqual(config.url, "https://api.company.com/mcp/v1");
});

test("buildServerConfig - remote URL with transport sse", () => {
  const parsed = parseSource("https://mcp.example.com/sse");
  const config = buildServerConfig(parsed, { transport: "sse" });

  assert.strictEqual(config.type, "sse");
  assert.strictEqual(config.url, "https://mcp.example.com/sse");
});

test("buildServerConfig - remote URL with transport http", () => {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, { transport: "http" });

  assert.strictEqual(config.type, "http");
  assert.strictEqual(config.url, "https://mcp.example.com/mcp");
});

// buildServerConfig tests - Package
test("buildServerConfig - simple package", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, ["-y", "mcp-server-postgres"]);
  assert.strictEqual(config.url, undefined);
});

test("buildServerConfig - scoped package", () => {
  const parsed = parseSource("@modelcontextprotocol/server-postgres");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, [
    "-y",
    "@modelcontextprotocol/server-postgres",
  ]);
});

test("buildServerConfig - package with version", () => {
  const parsed = parseSource("mcp-server@1.0.0");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, ["-y", "mcp-server@1.0.0"]);
});

test("buildServerConfig - package includes env when provided", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      API_KEY: "secret",
      DATABASE_URL: "postgres://localhost/my-db",
    },
  });

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, ["-y", "mcp-server-postgres"]);
  assert.deepStrictEqual(config.env, {
    API_KEY: "secret",
    DATABASE_URL: "postgres://localhost/my-db",
  });
});

test("buildServerConfig - package appends args when provided", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    args: ["--read-only", "--workspace", "team-a"],
  });

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, [
    "-y",
    "mcp-server-postgres",
    "--read-only",
    "--workspace",
    "team-a",
  ]);
});

test("buildServerConfig - package includes env and args together", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      DATABASE_URL: "postgres://localhost/my-db",
    },
    args: ["--read-only"],
  });

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, [
    "-y",
    "mcp-server-postgres",
    "--read-only",
  ]);
  assert.deepStrictEqual(config.env, {
    DATABASE_URL: "postgres://localhost/my-db",
  });
});

// buildServerConfig tests - Command
test("buildServerConfig - npx command", () => {
  const parsed = parseSource("npx -y @org/mcp-server");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, ["-y", "@org/mcp-server"]);
});

test("buildServerConfig - node command", () => {
  const parsed = parseSource("node /path/to/server.js --port 3000");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "node");
  assert.deepStrictEqual(config.args, ["/path/to/server.js", "--port", "3000"]);
});

test("buildServerConfig - python command", () => {
  const parsed = parseSource("python -m mcp_server");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "python");
  assert.deepStrictEqual(config.args, ["-m", "mcp_server"]);
});

test("buildServerConfig - command with multiple args", () => {
  const parsed = parseSource(
    "npx -y mcp-server --db postgres://localhost --verbose",
  );
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "npx");
  assert.deepStrictEqual(config.args, [
    "-y",
    "mcp-server",
    "--db",
    "postgres://localhost",
    "--verbose",
  ]);
});

test("buildServerConfig - command includes env when provided", () => {
  const parsed = parseSource("node /path/to/server.js --port 3000");
  const config = buildServerConfig(parsed, {
    env: {
      NODE_ENV: "production",
      FOO: "bar=baz",
    },
  });

  assert.strictEqual(config.command, "node");
  assert.deepStrictEqual(config.args, ["/path/to/server.js", "--port", "3000"]);
  assert.deepStrictEqual(config.env, {
    NODE_ENV: "production",
    FOO: "bar=baz",
  });
});

test("buildServerConfig - command appends args when provided", () => {
  const parsed = parseSource("node /path/to/server.js --port 3000");
  const config = buildServerConfig(parsed, {
    args: ["--read-only"],
  });

  assert.strictEqual(config.command, "node");
  assert.deepStrictEqual(config.args, [
    "/path/to/server.js",
    "--port",
    "3000",
    "--read-only",
  ]);
});

// Regression: https://github.com/neon-solutions/add-mcp/issues/29
// Absolute paths must be preserved verbatim as the command — never split on
// spaces, even when the path itself contains spaces.
test("buildServerConfig - absolute path with spaces stays a single command", () => {
  const parsed = parseSource(
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer",
  );
  const config = buildServerConfig(parsed);

  assert.strictEqual(
    config.command,
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer",
  );
  assert.deepStrictEqual(config.args, []);
});

test("buildServerConfig - absolute path with spaces still accepts --args", () => {
  const parsed = parseSource(
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer",
  );
  const config = buildServerConfig(parsed, {
    args: ["--port", "3000"],
    env: { LOG_LEVEL: "debug" },
  });

  assert.strictEqual(
    config.command,
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer",
  );
  assert.deepStrictEqual(config.args, ["--port", "3000"]);
  assert.deepStrictEqual(config.env, { LOG_LEVEL: "debug" });
});

test("buildServerConfig - absolute path without spaces", () => {
  const parsed = parseSource("/usr/local/bin/my-mcp-server");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "/usr/local/bin/my-mcp-server");
  assert.deepStrictEqual(config.args, []);
});

test("buildServerConfig - home-relative path with spaces", () => {
  const parsed = parseSource("~/My Tools/server-bin");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "~/My Tools/server-bin");
  assert.deepStrictEqual(config.args, []);
});

test("buildServerConfig - dot-relative path with spaces", () => {
  const parsed = parseSource("./local bin/my-server");
  const config = buildServerConfig(parsed);

  assert.strictEqual(config.command, "./local bin/my-server");
  assert.deepStrictEqual(config.args, []);
});

test("buildServerConfig - Windows path with spaces", () => {
  const parsed = parseSource("C:\\Program Files\\My App\\bin\\server.exe");
  const config = buildServerConfig(parsed);

  assert.strictEqual(
    config.command,
    "C:\\Program Files\\My App\\bin\\server.exe",
  );
  assert.deepStrictEqual(config.args, []);
});

test("buildServerConfig - remote source ignores env", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed, {
    env: {
      API_KEY: "secret",
    },
    args: ["--ignored"],
  });

  assert.strictEqual(config.type, "http");
  assert.strictEqual(config.url, "https://mcp.example.com/api");
  assert.strictEqual(config.env, undefined);
  assert.strictEqual(config.args, undefined);
});

test("buildServerConfig - remote stores timeout and oauthScopes", () => {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, {
    timeout: 30000,
    oauthScopes: ["read", "write"],
  });

  assert.strictEqual(config.timeout, 30000);
  assert.deepStrictEqual(config.oauthScopes, ["read", "write"]);
});

test("buildServerConfig - package ignores timeout and oauthScopes", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    timeout: 30000,
    oauthScopes: ["read"],
  });

  assert.strictEqual(config.timeout, undefined);
  assert.strictEqual(config.oauthScopes, undefined);
});

// ============================================
// Capability gating (applyFieldSupport)
// ============================================

test("applyFieldSupport - drops unsupported optional fields without mutating input", () => {
  const original = {
    type: "http" as const,
    url: "https://mcp.example.com/mcp",
    timeout: 30000,
    oauthScopes: ["read", "write"],
  };

  const { config, dropped } = applyFieldSupport(original, ["scopes"]);

  // timeout dropped (unsupported), scopes kept (supported)
  assert.strictEqual(config.timeout, undefined);
  assert.deepStrictEqual(config.oauthScopes, ["read", "write"]);
  assert.deepStrictEqual(dropped, ["timeout"]);

  // Input object is never mutated (it is reused across agents)
  assert.strictEqual(original.timeout, 30000);
  assert.deepStrictEqual(original.oauthScopes, ["read", "write"]);
});

test("applyFieldSupport - keeps all fields when fully supported", () => {
  const { config, dropped } = applyFieldSupport(
    {
      type: "http",
      url: "https://mcp.example.com/mcp",
      timeout: 5000,
      oauthScopes: ["read"],
    },
    ["timeout", "scopes"],
  );

  assert.strictEqual(config.timeout, 5000);
  assert.deepStrictEqual(config.oauthScopes, ["read"]);
  assert.deepStrictEqual(dropped, []);
});

// ============================================
// Per-agent optional field mapping (no leaks)
// ============================================

function installRemoteWith(
  agentType: AgentType,
  tempDir: string,
  extra: { timeout?: number; oauthScopes?: string[] },
) {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, extra);
  return installServerForAgent("example", config, agentType, {
    local: true,
    cwd: tempDir,
  });
}

test("installServerForAgent - Cursor maps scopes to auth.scopes", () => {
  const tempDir = createTempDir();
  const result = installRemoteWith("cursor", tempDir, {
    oauthScopes: ["read", "write"],
    timeout: 30000,
  });
  assert.ok(result.success);
  // Cursor supports scopes but not timeout
  assert.deepStrictEqual(result.droppedFields, ["timeout"]);

  const saved = readJsonConfig(join(tempDir, ".cursor", "mcp.json"));
  const server = (saved.mcpServers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.deepStrictEqual(server.auth, { scopes: ["read", "write"] });
  assert.ok(!("timeout" in server), "timeout must not leak into Cursor config");
  assert.ok(
    !("oauthScopes" in server),
    "raw oauthScopes must never be written",
  );
});

test("installServerForAgent - Gemini maps scopes to oauth.scopes and keeps timeout", () => {
  const tempDir = createTempDir();
  const result = installRemoteWith("gemini-cli", tempDir, {
    oauthScopes: ["https://example.com/scope"],
    timeout: 30000,
  });
  assert.ok(result.success);
  assert.strictEqual(result.droppedFields, undefined);

  const saved = readJsonConfig(join(tempDir, ".gemini", "settings.json"));
  const server = (saved.mcpServers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.deepStrictEqual(server.oauth, {
    scopes: ["https://example.com/scope"],
  });
  assert.strictEqual(server.timeout, 30000);
  assert.ok(
    !("oauthScopes" in server),
    "raw oauthScopes must never be written",
  );
});

test("installServerForAgent - Claude Code keeps timeout, drops scopes", () => {
  const tempDir = createTempDir();
  const result = installRemoteWith("claude-code", tempDir, {
    oauthScopes: ["read"],
    timeout: 12000,
  });
  assert.ok(result.success);
  assert.deepStrictEqual(result.droppedFields, ["scopes"]);

  const saved = readJsonConfig(join(tempDir, ".mcp.json"));
  const server = (saved.mcpServers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.strictEqual(server.timeout, 12000);
  assert.ok(!("auth" in server));
  assert.ok(!("oauth" in server));
  assert.ok(!("oauthScopes" in server));
});

test("installServerForAgent - Pi maps timeout to requestTimeoutMs", () => {
  const tempDir = createTempDir();
  const result = installRemoteWith("pi", tempDir, {
    timeout: 12000,
  });
  assert.ok(result.success);
  assert.strictEqual(result.droppedFields, undefined);

  const saved = readJsonConfig(join(tempDir, ".pi", "mcp.json"));
  const server = (saved.mcpServers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
  assert.strictEqual(server.requestTimeoutMs, 12000);
  assert.ok(!("type" in server));
  assert.ok(!("timeout" in server));
});

test("installServerForAgent - VS Code drops both timeout and scopes", () => {
  const tempDir = createTempDir();
  const result = installRemoteWith("vscode", tempDir, {
    oauthScopes: ["read"],
    timeout: 12000,
  });
  assert.ok(result.success);
  assert.deepStrictEqual(result.droppedFields, ["timeout", "scopes"]);

  const saved = readJsonConfig(join(tempDir, ".vscode", "mcp.json"));
  const server = (saved.servers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
  assert.ok(!("timeout" in server));
  assert.ok(!("oauthScopes" in server));
});

// ============================================
// Auto-approval (Codex + Claude Code)
// ============================================

test("applyFieldSupport - empty autoApproveTools (all tools) is kept when supported", () => {
  const { config, dropped } = applyFieldSupport(
    { command: "x", args: [], autoApproveTools: [] },
    ["autoApprove"],
  );
  assert.deepStrictEqual(config.autoApproveTools, []);
  assert.deepStrictEqual(dropped, []);
});

test("applyFieldSupport - autoApprove dropped (and reported) when unsupported, input untouched", () => {
  const original = { command: "x", args: [], autoApproveTools: ["run"] };
  const { config, dropped } = applyFieldSupport(original, []);
  assert.strictEqual(config.autoApproveTools, undefined);
  assert.deepStrictEqual(dropped, ["autoApprove"]);
  assert.deepStrictEqual(original.autoApproveTools, ["run"]);
});

test("installServerForAgent - Codex auto-approve selected tools writes per-tool approval", () => {
  const tempDir = createTempDir();
  const config = buildServerConfig(parseSource("executor mcp"), {
    autoApproveTools: ["execute"],
  });
  const result = installServerForAgent("executor", config, "codex", {
    local: true,
    cwd: tempDir,
  });
  assert.ok(result.success);
  assert.strictEqual(result.droppedFields, undefined);

  const saved = readTomlConfig(join(tempDir, ".codex", "config.toml"));
  const server = (saved.mcp_servers as Record<string, Record<string, unknown>>)
    .executor;
  assert.ok(server);
  assert.deepStrictEqual(server.tools, {
    execute: { approval_mode: "approve" },
  });
  assert.ok(!("autoApproveTools" in server), "directive must never be written");
});

test("installServerForAgent - Codex auto-approve all tools writes server default", () => {
  const tempDir = createTempDir();
  const config = buildServerConfig(parseSource("executor mcp"), {
    autoApproveTools: [],
  });
  const result = installServerForAgent("executor", config, "codex", {
    local: true,
    cwd: tempDir,
  });
  assert.ok(result.success);

  const saved = readTomlConfig(join(tempDir, ".codex", "config.toml"));
  const server = (saved.mcp_servers as Record<string, Record<string, unknown>>)
    .executor;
  assert.ok(server);
  assert.strictEqual(server.default_tools_approval_mode, "approve");
});

test("installServerForAgent - Claude Code auto-approve writes settings.local.json + extraPaths", () => {
  const tempDir = createTempDir();
  const config = buildServerConfig(parseSource("executor mcp"), {
    autoApproveTools: ["execute"],
  });
  const result = installServerForAgent("executor", config, "claude-code", {
    local: true,
    cwd: tempDir,
  });
  assert.ok(result.success);

  // Server config stays clean (no permission/directive leakage)
  const mcp = readJsonConfig(join(tempDir, ".mcp.json"));
  const server = (mcp.mcpServers as Record<string, Record<string, unknown>>)
    .executor;
  assert.ok(server);
  assert.ok(!("autoApproveTools" in server));
  assert.ok(!("permissions" in server));

  // Permissions live in the separate settings file, surfaced via extraPaths
  const settingsPath = join(tempDir, ".claude", "settings.local.json");
  assert.deepStrictEqual(result.extraPaths, [settingsPath]);
  const settings = readJsonConfig(settingsPath);
  const permissions = settings.permissions as Record<string, unknown>;
  assert.deepStrictEqual(permissions.allow, ["mcp__executor__execute"]);
});

test("installServerForAgent - Claude Code auto-approve all tools uses server-level rule", () => {
  const tempDir = createTempDir();
  const config = buildServerConfig(parseSource("executor mcp"), {
    autoApproveTools: [],
  });
  const result = installServerForAgent("executor", config, "claude-code", {
    local: true,
    cwd: tempDir,
  });
  assert.ok(result.success);

  const settings = readJsonConfig(
    join(tempDir, ".claude", "settings.local.json"),
  );
  const permissions = settings.permissions as Record<string, unknown>;
  assert.deepStrictEqual(permissions.allow, ["mcp__executor"]);
});

test("installServerForAgent - Claude Code auto-approve merges into existing permissions", () => {
  const tempDir = createTempDir();
  const settingsPath = join(tempDir, ".claude", "settings.local.json");
  mkdirSync(join(tempDir, ".claude"), { recursive: true });
  writeFileSync(
    settingsPath,
    JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }),
  );

  const config = buildServerConfig(parseSource("executor mcp"), {
    autoApproveTools: ["execute"],
  });
  installServerForAgent("executor", config, "claude-code", {
    local: true,
    cwd: tempDir,
  });

  const settings = readJsonConfig(settingsPath);
  const permissions = settings.permissions as Record<string, unknown>;
  assert.deepStrictEqual(permissions.allow, [
    "Bash(ls)",
    "mcp__executor__execute",
  ]);
});

test("installServerForAgent - unsupported agent drops autoApprove with no leak", () => {
  const tempDir = createTempDir();
  const config = buildServerConfig(parseSource("https://mcp.example.com/mcp"), {
    autoApproveTools: ["execute"],
  });
  const result = installServerForAgent("example", config, "cursor", {
    local: true,
    cwd: tempDir,
  });
  assert.ok(result.success);
  assert.deepStrictEqual(result.droppedFields, ["autoApprove"]);

  const saved = readJsonConfig(join(tempDir, ".cursor", "mcp.json"));
  const server = (saved.mcpServers as Record<string, Record<string, unknown>>)
    .example;
  assert.ok(server);
  assert.ok(!("autoApproveTools" in server));
  assert.ok(!("tools" in server));
});

// ============================================
// installServer with routing tests
// ============================================

test("installServer - routes agents based on routing map", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const agentTypes: AgentType[] = ["cursor", "vscode"];
  const routing = new Map<AgentType, "local" | "global">();
  routing.set("cursor", "local");
  routing.set("vscode", "local");

  const results = installServer("example", config, agentTypes, {
    routing,
    cwd: tempDir,
  });

  assert.strictEqual(results.size, 2);

  // Both should succeed
  const cursorResult = results.get("cursor");
  const vscodeResult = results.get("vscode");

  assert.ok(cursorResult?.success);
  assert.ok(vscodeResult?.success);

  // Both should be in local paths
  assert.ok(cursorResult?.path.includes(tempDir));
  assert.ok(vscodeResult?.path.includes(tempDir));

  // Verify files exist
  assert.strictEqual(existsSync(join(tempDir, ".cursor", "mcp.json")), true);
  assert.strictEqual(existsSync(join(tempDir, ".vscode", "mcp.json")), true);
});

test("installServer - mixed routing (local and global simulation)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  // Simulate mixed routing: cursor local, but route another to "global" (which won't use cwd)
  const agentTypes: AgentType[] = ["cursor"];
  const routing = new Map<AgentType, "local" | "global">();
  routing.set("cursor", "local");

  const results = installServer("postgres", config, agentTypes, {
    routing,
    cwd: tempDir,
  });

  assert.strictEqual(results.size, 1);

  const cursorResult = results.get("cursor");
  assert.ok(cursorResult?.success);
  assert.ok(cursorResult?.path.includes(tempDir));

  // Verify local config
  const configPath = join(tempDir, ".cursor", "mcp.json");
  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;
  assert.ok(mcpServers.postgres);
});

test("installServer - empty routing map defaults to global", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const agentTypes: AgentType[] = ["cursor"];
  const routing = new Map<AgentType, "local" | "global">();
  // Don't set any routing - should default to global (local: false)

  const results = installServer("example", config, agentTypes, {
    routing,
    cwd: tempDir,
  });

  const cursorResult = results.get("cursor");
  assert.ok(cursorResult?.success);
  // Path should NOT be in tempDir (should be global path)
  assert.ok(!cursorResult?.path.includes(tempDir));
});

test("installServer - routing with multiple agents to different scopes", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  // Route cursor to local, leave vscode unspecified (will be global)
  const agentTypes: AgentType[] = ["cursor", "vscode"];
  const routing = new Map<AgentType, "local" | "global">();
  routing.set("cursor", "local");
  // vscode not in routing - should default to global

  const results = installServer("example", config, agentTypes, {
    routing,
    cwd: tempDir,
  });

  const cursorResult = results.get("cursor");
  const vscodeResult = results.get("vscode");

  assert.ok(cursorResult?.success);
  assert.ok(vscodeResult?.success);

  // Cursor should be local
  assert.ok(cursorResult?.path.includes(tempDir));

  // VSCode should be global (not in tempDir)
  assert.ok(!vscodeResult?.path.includes(tempDir));
});

test("installServer - github-copilot-cli local uses VS Code servers key", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const results = installServer("postgres", config, ["github-copilot-cli"], {
    routing: new Map<AgentType, "local" | "global">([
      ["github-copilot-cli", "local"],
    ]),
    cwd: tempDir,
  });

  const result = results.get("github-copilot-cli");
  assert.ok(result?.success);
  const saved = readJsonConfig(join(tempDir, ".vscode", "mcp.json"));
  const servers = saved.servers as Record<string, unknown>;
  assert.ok(servers.postgres);
});

test("installServer - github-copilot-cli global uses mcpServers key and CLI schema", () => {
  const tempDir = createTempDir();
  const originalPath = agents["github-copilot-cli"].configPath;
  agents["github-copilot-cli"].configPath = join(tempDir, "mcp-config.json");

  try {
    const parsed = parseSource("https://mcp.example.com/mcp");
    const config = buildServerConfig(parsed);

    const results = installServer("example", config, ["github-copilot-cli"], {
      routing: new Map<AgentType, "local" | "global">([
        ["github-copilot-cli", "global"],
      ]),
      cwd: tempDir,
    });

    const result = results.get("github-copilot-cli");
    assert.ok(result?.success);
    const saved = readJsonConfig(join(tempDir, "mcp-config.json"));
    const mcpServers = saved.mcpServers as Record<string, unknown>;
    const server = mcpServers.example as Record<string, unknown>;
    assert.strictEqual(server.type, "http");
    assert.strictEqual(server.url, "https://mcp.example.com/mcp");
    assert.deepStrictEqual(server.tools, ["*"]);
  } finally {
    agents["github-copilot-cli"].configPath = originalPath;
  }
});

test("installServer - cline-cli global uses mcpServers key and Cline schema", () => {
  const tempDir = createTempDir();
  const originalPath = agents["cline-cli"].configPath;
  agents["cline-cli"].configPath = join(
    tempDir,
    "data",
    "settings",
    "cline_mcp_settings.json",
  );

  try {
    const parsed = parseSource("https://mcp.example.com/sse");
    const config = buildServerConfig(parsed, {
      transport: "sse",
      headers: {
        Authorization: "Bearer token",
      },
    });

    const results = installServer("example", config, ["cline-cli"], {
      routing: new Map<AgentType, "local" | "global">([
        ["cline-cli", "global"],
      ]),
      cwd: tempDir,
    });

    const result = results.get("cline-cli");
    assert.ok(result?.success);

    const saved = readJsonConfig(
      join(tempDir, "data", "settings", "cline_mcp_settings.json"),
    );
    const mcpServers = saved.mcpServers as Record<string, unknown>;
    const server = mcpServers.example as Record<string, unknown>;

    assert.strictEqual(server.url, "https://mcp.example.com/sse");
    assert.strictEqual(server.type, "sse");
    assert.strictEqual(server.disabled, false);
    assert.deepStrictEqual(server.headers, {
      Authorization: "Bearer token",
    });
  } finally {
    agents["cline-cli"].configPath = originalPath;
  }
});

test("installServer - cline extension global uses VS Code global storage path", () => {
  const tempDir = createTempDir();
  const originalPath = agents.cline.configPath;
  agents.cline.configPath = join(
    tempDir,
    "Code",
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json",
  );

  try {
    const parsed = parseSource("https://mcp.example.com/mcp");
    const config = buildServerConfig(parsed);

    const results = installServer("example", config, ["cline"], {
      routing: new Map<AgentType, "local" | "global">([["cline", "global"]]),
      cwd: tempDir,
    });

    const result = results.get("cline");
    assert.ok(result?.success);

    const saved = readJsonConfig(
      join(
        tempDir,
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json",
      ),
    );
    const mcpServers = saved.mcpServers as Record<string, unknown>;
    const server = mcpServers.example as Record<string, unknown>;

    assert.strictEqual(server.url, "https://mcp.example.com/mcp");
    assert.strictEqual(server.type, "streamableHttp");
    assert.strictEqual(server.disabled, false);
  } finally {
    agents.cline.configPath = originalPath;
  }
});

test("installServer - mcporter local writes config/mcporter.json", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const results = installServer("postgres", config, ["mcporter"], {
    routing: new Map<AgentType, "local" | "global">([["mcporter", "local"]]),
    cwd: tempDir,
  });

  const result = results.get("mcporter");
  assert.ok(result?.success);
  assert.strictEqual(result?.path, join(tempDir, "config", "mcporter.json"));
  assert.strictEqual(
    existsSync(join(tempDir, "config", "mcporter.json")),
    true,
  );
});

test("installServer - mcporter global prefers existing mcporter.jsonc", () => {
  const tempDir = createTempDir();
  const originalPath = agents.mcporter.configPath;
  agents.mcporter.configPath = join(tempDir, ".mcporter", "mcporter.json");
  mkdirSync(join(tempDir, ".mcporter"), { recursive: true });
  writeFileSync(join(tempDir, ".mcporter", "mcporter.jsonc"), "{}");

  try {
    const parsed = parseSource("https://mcp.example.com/mcp");
    const config = buildServerConfig(parsed);
    const results = installServer("example", config, ["mcporter"], {
      routing: new Map<AgentType, "local" | "global">([["mcporter", "global"]]),
      cwd: tempDir,
    });

    const result = results.get("mcporter");
    assert.ok(result?.success);
    assert.strictEqual(
      result?.path,
      join(tempDir, ".mcporter", "mcporter.jsonc"),
    );
    assert.strictEqual(
      existsSync(join(tempDir, ".mcporter", "mcporter.jsonc")),
      true,
    );
  } finally {
    agents.mcporter.configPath = originalPath;
  }
});

test("installServer - mcporter global prefers mcporter.json over mcporter.jsonc", () => {
  const tempDir = createTempDir();
  const originalPath = agents.mcporter.configPath;
  agents.mcporter.configPath = join(tempDir, ".mcporter", "mcporter.json");
  mkdirSync(join(tempDir, ".mcporter"), { recursive: true });
  writeFileSync(join(tempDir, ".mcporter", "mcporter.json"), "{}");
  writeFileSync(join(tempDir, ".mcporter", "mcporter.jsonc"), "{}");

  try {
    const parsed = parseSource("https://mcp.example.com/mcp");
    const config = buildServerConfig(parsed);
    const results = installServer("example", config, ["mcporter"], {
      routing: new Map<AgentType, "local" | "global">([["mcporter", "global"]]),
      cwd: tempDir,
    });

    const result = results.get("mcporter");
    assert.ok(result?.success);
    assert.strictEqual(
      result?.path,
      join(tempDir, ".mcporter", "mcporter.json"),
    );
  } finally {
    agents.mcporter.configPath = originalPath;
  }
});

test("updateGitignoreWithPaths - creates .gitignore when missing", () => {
  const tempDir = createTempDir();
  const configPath = join(tempDir, ".cursor", "mcp.json");

  const result = updateGitignoreWithPaths([configPath], { cwd: tempDir });

  assert.deepStrictEqual(result.added, [".cursor/mcp.json"]);
  const gitignorePath = join(tempDir, ".gitignore");
  assert.strictEqual(existsSync(gitignorePath), true);
  assert.strictEqual(
    readFileSync(gitignorePath, "utf-8"),
    ".cursor/mcp.json\n",
  );
});

test("updateGitignoreWithPaths - appends only new local paths", () => {
  const tempDir = createTempDir();
  const gitignorePath = join(tempDir, ".gitignore");

  updateGitignoreWithPaths([join(tempDir, ".cursor", "mcp.json")], {
    cwd: tempDir,
  });
  const result = updateGitignoreWithPaths(
    [
      join(tempDir, ".cursor", "mcp.json"),
      join(tempDir, ".vscode", "mcp.json"),
      join(tempDir, "..", "outside.json"),
    ],
    { cwd: tempDir },
  );

  assert.deepStrictEqual(result.added, [".vscode/mcp.json"]);
  assert.strictEqual(
    readFileSync(gitignorePath, "utf-8"),
    ".cursor/mcp.json\n.vscode/mcp.json\n",
  );
});

// Cleanup and summary
cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
