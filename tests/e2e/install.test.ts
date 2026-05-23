#!/usr/bin/env tsx

/**
 * E2E tests for MCP server installation
 *
 * These tests create temporary directories, install MCP servers,
 * and verify the config files are created correctly.
 *
 * Run with: npx tsx tests/e2e/install.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import * as TOML from "@iarna/toml";
import { parseSource } from "../../src/source-parser.js";
import {
  buildServerConfig,
  installServerForAgent,
} from "../../src/installer.js";
import { agents } from "../../src/agents.js";
import { writeConfig, buildConfigWithKey } from "../../src/formats/index.js";
import type { AgentType } from "../../src/types.js";

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
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-test-"));
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

// Test helper to read JSON config
function readJsonConfig(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

// Test helper to read YAML config
function readYamlConfig(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  return yaml.load(content) as Record<string, unknown>;
}

// Test helper to read TOML config
function readTomlConfig(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  return TOML.parse(content) as Record<string, unknown>;
}

// ============================================
// E2E Tests: JSON format agents (local install)
// ============================================

test("E2E: Install remote MCP to Cursor (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("example", config, "cursor", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;
  assert.ok(mcpServers);

  const serverConfig = mcpServers.example as Record<string, unknown>;
  assert.ok(!("type" in serverConfig));
  assert.strictEqual(serverConfig.url, "https://mcp.example.com/api");
});

test("E2E: Install remote MCP to Cursor (local, sse)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/sse");
  const config = buildServerConfig(parsed, { transport: "sse" });

  const result = installServerForAgent("example-sse", config, "cursor", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;
  assert.ok(mcpServers);

  const serverConfig = mcpServers["example-sse"] as Record<string, unknown>;
  assert.ok(!("type" in serverConfig));
  assert.strictEqual(serverConfig.url, "https://mcp.example.com/sse");
});

test("E2E: Install package MCP to Cursor (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("@modelcontextprotocol/server-postgres");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("postgres", config, "cursor", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".cursor", "mcp.json");
  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;

  const serverConfig = mcpServers.postgres as Record<string, unknown>;
  assert.strictEqual(serverConfig.command, "npx");
  assert.deepStrictEqual(serverConfig.args, [
    "-y",
    "@modelcontextprotocol/server-postgres",
  ]);
});

test("E2E: Install command MCP to Claude Code (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("node /path/to/server.js --port 3000");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("custom", config, "claude-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;

  const serverConfig = mcpServers.custom as Record<string, unknown>;
  assert.strictEqual(serverConfig.command, "node");
  assert.deepStrictEqual(serverConfig.args, [
    "/path/to/server.js",
    "--port",
    "3000",
  ]);
});

test("E2E: Install to VS Code (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://api.company.com/mcp");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("company", config, "vscode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".vscode", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  // VSCode uses "servers" key, not "mcpServers"
  const servers = savedConfig.servers as Record<string, unknown>;
  assert.ok(servers.company);
});

test("E2E: Install to GitHub Copilot CLI (local) writes VS Code schema", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://api.company.com/mcp");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent(
    "company",
    config,
    "github-copilot-cli",
    {
      local: true,
      cwd: tempDir,
    },
  );

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".vscode", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const servers = savedConfig.servers as Record<string, unknown>;
  assert.ok(servers.company);
});

test("E2E: Install to OpenCode (local) - transformed format", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.openai.com/api");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("openai", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, "opencode.json");
  const savedConfig = readJsonConfig(configPath);
  const mcp = savedConfig.mcp as Record<string, unknown>;

  const serverConfig = mcp.openai as Record<string, unknown>;
  // OpenCode uses different format
  assert.strictEqual(serverConfig.type, "remote");
  assert.strictEqual(serverConfig.url, "https://mcp.openai.com/api");
  assert.strictEqual(serverConfig.enabled, true);
});

test("E2E: Install local server to OpenCode - transformed format", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("postgres", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, "opencode.json");
  const savedConfig = readJsonConfig(configPath);
  const mcp = savedConfig.mcp as Record<string, unknown>;

  const serverConfig = mcp.postgres as Record<string, unknown>;
  assert.strictEqual(serverConfig.type, "local");
  assert.deepStrictEqual(serverConfig.command, [
    "npx",
    "-y",
    "mcp-server-postgres",
  ]);
  assert.strictEqual(serverConfig.enabled, true);
});

test("E2E: Install local server to OpenCode maps env to environment", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      API_KEY: "secret",
      DATABASE_URL: "postgres://localhost/test",
    },
  });

  const result = installServerForAgent("postgres", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, "opencode.json");
  const savedConfig = readJsonConfig(configPath);
  const mcp = savedConfig.mcp as Record<string, unknown>;

  const serverConfig = mcp.postgres as Record<string, unknown>;
  assert.deepStrictEqual(serverConfig.environment, {
    API_KEY: "secret",
    DATABASE_URL: "postgres://localhost/test",
  });
});

test("E2E: Install to Gemini CLI (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-github");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("github", config, "gemini-cli", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".gemini", "settings.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;
  assert.ok(mcpServers.github);
});

// ============================================
// E2E Tests: Merge existing config
// ============================================

test("E2E: Merge with existing config - preserves other servers", () => {
  const tempDir = createTempDir();

  // First install
  const parsed1 = parseSource("https://mcp.example.com/api");
  const config1 = buildServerConfig(parsed1);
  installServerForAgent("server1", config1, "cursor", {
    local: true,
    cwd: tempDir,
  });

  // Second install
  const parsed2 = parseSource("mcp-server-postgres");
  const config2 = buildServerConfig(parsed2);
  installServerForAgent("server2", config2, "cursor", {
    local: true,
    cwd: tempDir,
  });

  const configPath = join(tempDir, ".cursor", "mcp.json");
  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;

  // Both servers should exist
  assert.ok(mcpServers.server1);
  assert.ok(mcpServers.server2);
});

test("E2E: Overwrite existing server with same name", () => {
  const tempDir = createTempDir();

  // First install
  const parsed1 = parseSource("https://mcp.old.com/api");
  const config1 = buildServerConfig(parsed1);
  installServerForAgent("myserver", config1, "cursor", {
    local: true,
    cwd: tempDir,
  });

  // Second install with same name but different URL
  const parsed2 = parseSource("https://mcp.new.com/api");
  const config2 = buildServerConfig(parsed2);
  installServerForAgent("myserver", config2, "cursor", {
    local: true,
    cwd: tempDir,
  });

  const configPath = join(tempDir, ".cursor", "mcp.json");
  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<string, unknown>;

  const serverConfig = mcpServers.myserver as Record<string, unknown>;
  // Should have the new URL
  assert.strictEqual(serverConfig.url, "https://mcp.new.com/api");
});

// ============================================
// E2E Tests: YAML format (Goose)
// ============================================

test("E2E: Install to Goose (YAML format, transformed) - local server", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const gooseAgent = agents.goose;

  // Test the transform function
  const transformed = gooseAgent.transformConfig!("postgres", config);

  assert.strictEqual((transformed as Record<string, unknown>).name, "postgres");
  assert.strictEqual((transformed as Record<string, unknown>).cmd, "npx");
  assert.deepStrictEqual((transformed as Record<string, unknown>).args, [
    "-y",
    "mcp-server-postgres",
  ]);
  assert.strictEqual((transformed as Record<string, unknown>).type, "stdio");
  assert.strictEqual((transformed as Record<string, unknown>).enabled, true);
});

test("E2E: Install to Goose (YAML format, transformed) maps env to envs", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      API_KEY: "secret",
      NESTED: "value=with=equals",
    },
  });

  const gooseAgent = agents.goose;
  const transformed = gooseAgent.transformConfig!("postgres", config);

  assert.deepStrictEqual((transformed as Record<string, unknown>).envs, {
    API_KEY: "secret",
    NESTED: "value=with=equals",
  });
});

test("E2E: Install to Goose (YAML format, transformed) - remote server (http)", () => {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed);

  const gooseAgent = agents.goose;

  // Test the transform function for remote servers (default http)
  const transformed = gooseAgent.transformConfig!("example", config);

  assert.strictEqual((transformed as Record<string, unknown>).name, "example");
  assert.strictEqual(
    (transformed as Record<string, unknown>).type,
    "streamable_http",
  );
  assert.strictEqual(
    (transformed as Record<string, unknown>).uri,
    "https://mcp.example.com/mcp",
  );
  assert.strictEqual((transformed as Record<string, unknown>).enabled, true);
});

test("E2E: Install to Goose (YAML format, transformed) - remote server (http) with headers", () => {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, {
    headers: {
      Authorization: "Bearer token",
      "x-read-only": "true",
    },
  });

  const gooseAgent = agents.goose;
  const transformed = gooseAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.type, "streamable_http");
  assert.strictEqual(transformed.uri, "https://mcp.example.com/mcp");
  assert.deepStrictEqual(transformed.headers, {
    Authorization: "Bearer token",
    "x-read-only": "true",
  });
});

test("E2E: Install to Goose (YAML format, transformed) - remote server (sse)", () => {
  const parsed = parseSource("https://mcp.example.com/sse");
  const config = buildServerConfig(parsed, { transport: "sse" });

  const gooseAgent = agents.goose;

  // Test the transform function for remote servers with SSE transport
  const transformed = gooseAgent.transformConfig!("example-sse", config);

  assert.strictEqual(
    (transformed as Record<string, unknown>).name,
    "example-sse",
  );
  assert.strictEqual((transformed as Record<string, unknown>).type, "sse");
  assert.strictEqual(
    (transformed as Record<string, unknown>).uri,
    "https://mcp.example.com/sse",
  );
  assert.strictEqual((transformed as Record<string, unknown>).enabled, true);
});

test("E2E: Install to Goose (YAML format, transformed) - remote server (sse) with headers", () => {
  const parsed = parseSource("https://mcp.example.com/sse");
  const config = buildServerConfig(parsed, {
    transport: "sse",
    headers: {
      Authorization: "Bearer token",
    },
  });

  const gooseAgent = agents.goose;
  const transformed = gooseAgent.transformConfig!(
    "example-sse",
    config,
  ) as Record<string, unknown>;

  assert.strictEqual(transformed.type, "sse");
  assert.strictEqual(transformed.uri, "https://mcp.example.com/sse");
  assert.deepStrictEqual(transformed.headers, {
    Authorization: "Bearer token",
  });
});

test("E2E: Write YAML config file (Goose format)", () => {
  const tempDir = createTempDir();
  const gooseConfigPath = join(tempDir, ".config", "goose", "config.yaml");

  const parsed = parseSource("mcp-server-postgres");
  const serverConfig = buildServerConfig(parsed);

  // Transform to Goose format
  const gooseAgent = agents.goose;
  const transformed = gooseAgent.transformConfig!("postgres", serverConfig);

  // Build config and write
  const config = buildConfigWithKey("extensions", "postgres", transformed);
  writeConfig(gooseConfigPath, config, "yaml", "extensions");

  // Verify file exists and has correct content
  assert.strictEqual(existsSync(gooseConfigPath), true);

  const savedConfig = readYamlConfig(gooseConfigPath);
  const extensions = savedConfig.extensions as Record<string, unknown>;
  assert.ok(extensions);

  const serverEntry = extensions.postgres as Record<string, unknown>;
  assert.strictEqual(serverEntry.name, "postgres");
  assert.strictEqual(serverEntry.cmd, "npx");
  assert.strictEqual(serverEntry.type, "stdio");
});

// ============================================
// E2E Tests: Zed (transformed format)
// ============================================

test("E2E: Zed config transformation - remote server", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const zedAgent = agents.zed;

  const transformed = zedAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.source, "custom");
  assert.strictEqual(transformed.type, "http");
  assert.strictEqual(transformed.url, "https://mcp.example.com/api");
});

test("E2E: Zed config transformation - local server", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const zedAgent = agents.zed;

  const transformed = zedAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.source, "custom");
  assert.strictEqual(transformed.command, "npx");
  assert.deepStrictEqual(transformed.args, ["-y", "mcp-server-postgres"]);
});

test("E2E: Zed config transformation - local server includes env", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      TOKEN: "abc123",
    },
  });

  const zedAgent = agents.zed;

  const transformed = zedAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.deepStrictEqual(transformed.env, {
    TOKEN: "abc123",
  });
});

// ============================================
// E2E Tests: Cline (transformed format)
// ============================================

test("E2E: Cline VSCode extension config transformation - remote http server", () => {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed);

  const clineAgent = agents.cline;
  const transformed = clineAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.url, "https://mcp.example.com/mcp");
  assert.strictEqual(transformed.type, "streamableHttp");
  assert.strictEqual(transformed.disabled, false);
});

test("E2E: Cline VSCode extension config transformation - local stdio server", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const clineAgent = agents.cline;
  const transformed = clineAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.command, "npx");
  assert.deepStrictEqual(transformed.args, ["-y", "mcp-server-postgres"]);
  assert.strictEqual(transformed.disabled, false);
});

test("E2E: Cline VSCode extension config transformation - local stdio includes env", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      API_KEY: "secret",
    },
  });

  const clineAgent = agents.cline;
  const transformed = clineAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.deepStrictEqual(transformed.env, {
    API_KEY: "secret",
  });
});

test("E2E: Cline CLI config transformation - local stdio server", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const clineAgent = agents["cline-cli"];
  const transformed = clineAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.command, "npx");
  assert.deepStrictEqual(transformed.args, ["-y", "mcp-server-postgres"]);
  assert.strictEqual(transformed.disabled, false);
});

// ============================================
// E2E Tests: Codex (TOML format)
// ============================================

test("E2E: Codex config transformation", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const codexAgent = agents.codex;

  const transformed = codexAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.type, "http");
  assert.strictEqual(transformed.url, "https://mcp.example.com/api");
});

test("E2E: Codex config transformation with headers", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed, {
    headers: {
      Authorization: "Bearer token",
    },
  });

  const codexAgent = agents.codex;

  const transformed = codexAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.deepStrictEqual(transformed.http_headers, {
    Authorization: "Bearer token",
  });
  assert.strictEqual("headers" in transformed, false);
});

test("E2E: Codex config transformation - local server", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const codexAgent = agents.codex;

  const transformed = codexAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.command, "npx");
  assert.deepStrictEqual(transformed.args, ["-y", "mcp-server-postgres"]);
});

test("E2E: Codex config transformation - local server includes env", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      OPENAI_API_KEY: "secret",
    },
  });

  const codexAgent = agents.codex;

  const transformed = codexAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.deepStrictEqual(transformed.env, {
    OPENAI_API_KEY: "secret",
  });
});

test("E2E: Write TOML config file (Codex format)", () => {
  const tempDir = createTempDir();
  const codexConfigPath = join(tempDir, ".codex", "config.toml");

  const parsed = parseSource("mcp-server-postgres");
  const serverConfig = buildServerConfig(parsed);

  // Transform to Codex format
  const codexAgent = agents.codex;
  const transformed = codexAgent.transformConfig!("postgres", serverConfig);

  // Build config and write
  const config = buildConfigWithKey("mcp_servers", "postgres", transformed);
  writeConfig(codexConfigPath, config, "toml", "mcp_servers");

  // Verify file exists and has correct content
  assert.strictEqual(existsSync(codexConfigPath), true);

  const savedConfig = readTomlConfig(codexConfigPath);
  const mcpServers = savedConfig.mcp_servers as Record<string, unknown>;
  assert.ok(mcpServers);

  const serverEntry = mcpServers.postgres as Record<string, unknown>;
  assert.strictEqual(serverEntry.command, "npx");
  assert.deepStrictEqual(serverEntry.args, ["-y", "mcp-server-postgres"]);
});

// ============================================
// E2E Tests: Multiple agents at once
// ============================================

test("E2E: Install to multiple agents", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const agents: AgentType[] = [
    "cursor",
    "claude-code",
    "vscode",
    "github-copilot-cli",
  ];

  for (const agent of agents) {
    const result = installServerForAgent("example", config, agent, {
      local: true,
      cwd: tempDir,
    });
    assert.strictEqual(result.success, true, `Failed for agent: ${agent}`);
  }

  // Verify all config files exist
  assert.strictEqual(existsSync(join(tempDir, ".cursor", "mcp.json")), true);
  assert.strictEqual(existsSync(join(tempDir, ".mcp.json")), true);
  assert.strictEqual(existsSync(join(tempDir, ".vscode", "mcp.json")), true);

  // VS Code and GitHub Copilot CLI both write to the same local file/key.
  const savedConfig = readJsonConfig(join(tempDir, ".vscode", "mcp.json"));
  const servers = savedConfig.servers as Record<string, unknown>;
  assert.ok(servers.example);
});

// Cleanup and summary
cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
