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
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
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

test("E2E: Install to OpenCode (local) - transformed format (jsonc default)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.openai.com/api");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("openai", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, "opencode.jsonc");
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

  const configPath = join(tempDir, "opencode.jsonc");
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

  const configPath = join(tempDir, "opencode.jsonc");
  const savedConfig = readJsonConfig(configPath);
  const mcp = savedConfig.mcp as Record<string, unknown>;

  const serverConfig = mcp.postgres as Record<string, unknown>;
  assert.deepStrictEqual(serverConfig.environment, {
    API_KEY: "secret",
    DATABASE_URL: "postgres://localhost/test",
  });
});

test("E2E: Install to OpenCode - prefers existing opencode.json over new .jsonc", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "opencode.json"), "{}");

  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("postgres", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(existsSync(join(tempDir, "opencode.jsonc")), false);

  const savedConfig = readJsonConfig(join(tempDir, "opencode.json"));
  const mcp = savedConfig.mcp as Record<string, unknown>;
  assert.strictEqual((mcp.postgres as Record<string, unknown>).type, "local");
});

test("E2E: Install to OpenCode - prefers existing opencode.jsonc over .json", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "opencode.jsonc"), "{}");

  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("postgres", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(existsSync(join(tempDir, "opencode.json")), false);

  const savedConfig = readJsonConfig(join(tempDir, "opencode.jsonc"));
  const mcp = savedConfig.mcp as Record<string, unknown>;
  assert.strictEqual((mcp.postgres as Record<string, unknown>).type, "local");
});

test("E2E: Install to OpenCode - preserves existing config structure (jsonc)", () => {
  const tempDir = createTempDir();
  writeFileSync(
    join(tempDir, "opencode.jsonc"),
    `{
  // my tools
  "mcp": {
    "existing-server": {
      "type": "local",
      "command": ["node", "server.js"],
      "enabled": false
    }
  }
}`,
  );

  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const result = installServerForAgent("postgres", config, "opencode", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const raw = readFileSync(join(tempDir, "opencode.jsonc"), "utf-8");
  assert.ok(raw.includes("// my tools"), "comment should be preserved");
  assert.ok(
    raw.includes('"existing-server"'),
    "existing server should be preserved",
  );
  assert.ok(raw.includes('"postgres"'), "new server should be added");
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

test("E2E: Re-install replaces server entry instead of merging (Goose YAML)", () => {
  const tempDir = createTempDir();
  const gooseConfigPath = join(tempDir, ".config", "goose", "config.yaml");
  const gooseAgent = agents.goose;

  // First install: local stdio server
  const stdioParsed = parseSource("mcp-server-postgres");
  const stdioConfig = buildServerConfig(stdioParsed, {
    env: { DATABASE_URL: "postgres://localhost" },
  });
  const stdioTransformed = gooseAgent.transformConfig!("postgres", stdioConfig);
  writeConfig(
    gooseConfigPath,
    buildConfigWithKey("extensions", "postgres", stdioTransformed),
    "yaml",
    "extensions",
  );

  // Second install under the same name: remote http server
  const remoteParsed = parseSource("https://mcp.example.com/api");
  const remoteConfig = buildServerConfig(remoteParsed);
  const remoteTransformed = gooseAgent.transformConfig!(
    "postgres",
    remoteConfig,
  );
  writeConfig(
    gooseConfigPath,
    buildConfigWithKey("extensions", "postgres", remoteTransformed),
    "yaml",
    "extensions",
  );

  const savedConfig = readYamlConfig(gooseConfigPath);
  const extensions = savedConfig.extensions as Record<string, unknown>;
  const serverEntry = extensions.postgres as Record<string, unknown>;
  assert.strictEqual(serverEntry.type, "streamable_http");
  assert.strictEqual(serverEntry.uri, "https://mcp.example.com/api");
  assert.strictEqual("cmd" in serverEntry, false);
  assert.strictEqual("args" in serverEntry, false);
  assert.strictEqual("envs" in serverEntry, false);
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

test("E2E: Re-install replaces server entry instead of merging (Codex TOML)", () => {
  const tempDir = createTempDir();

  // First install: local stdio server (the pre-1.x firecrawl setup shape)
  const stdioParsed = parseSource("firecrawl-mcp");
  const stdioConfig = buildServerConfig(stdioParsed, {
    env: { FIRECRAWL_API_KEY: "fc-test" },
  });
  const first = installServerForAgent("firecrawl", stdioConfig, "codex", {
    local: true,
    cwd: tempDir,
  });
  assert.strictEqual(first.success, true);

  // Second install under the same name: remote http server
  const remoteParsed = parseSource("https://mcp.firecrawl.dev/fc-test/v2/mcp");
  const remoteConfig = buildServerConfig(remoteParsed);
  const second = installServerForAgent("firecrawl", remoteConfig, "codex", {
    local: true,
    cwd: tempDir,
  });
  assert.strictEqual(second.success, true);

  // The entry must be purely remote: leftover stdio keys make Codex reject
  // the whole config with "url is not supported for stdio".
  const savedConfig = readTomlConfig(join(tempDir, ".codex", "config.toml"));
  const mcpServers = savedConfig.mcp_servers as Record<string, unknown>;
  const serverEntry = mcpServers.firecrawl as Record<string, unknown>;
  assert.strictEqual(
    serverEntry.url,
    "https://mcp.firecrawl.dev/fc-test/v2/mcp",
  );
  assert.strictEqual("command" in serverEntry, false);
  assert.strictEqual("args" in serverEntry, false);
  assert.strictEqual("env" in serverEntry, false);
});

test("E2E: Re-install replaces server entry instead of merging (JSON)", () => {
  const tempDir = createTempDir();

  const stdioParsed = parseSource("mcp-server-postgres");
  const stdioConfig = buildServerConfig(stdioParsed, {
    env: { DATABASE_URL: "postgres://localhost" },
  });
  const first = installServerForAgent("postgres", stdioConfig, "cursor", {
    local: true,
    cwd: tempDir,
  });
  assert.strictEqual(first.success, true);

  const remoteParsed = parseSource("https://mcp.example.com/api");
  const remoteConfig = buildServerConfig(remoteParsed);
  const second = installServerForAgent("postgres", remoteConfig, "cursor", {
    local: true,
    cwd: tempDir,
  });
  assert.strictEqual(second.success, true);

  const savedConfig = readJsonConfig(join(tempDir, ".cursor", "mcp.json"));
  const servers = savedConfig.mcpServers as Record<string, unknown>;
  const serverEntry = servers.postgres as Record<string, unknown>;
  assert.strictEqual(serverEntry.url, "https://mcp.example.com/api");
  assert.strictEqual("command" in serverEntry, false);
  assert.strictEqual("args" in serverEntry, false);
  assert.strictEqual("env" in serverEntry, false);
});

// ============================================
// E2E Tests: Grok Build (TOML format)
// ============================================

test("E2E: Grok Build config transformation - remote", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed);

  const grokAgent = agents["grok-build"];
  const transformed = grokAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.url, "https://mcp.example.com/api");
  assert.strictEqual("type" in transformed, false);
});

test("E2E: Grok Build config transformation with headers", () => {
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed, {
    headers: {
      Authorization: "Bearer token",
    },
  });

  const grokAgent = agents["grok-build"];
  const transformed = grokAgent.transformConfig!("example", config) as Record<
    string,
    unknown
  >;

  assert.deepStrictEqual(transformed.headers, {
    Authorization: "Bearer token",
  });
  assert.strictEqual(transformed.url, "https://mcp.example.com/api");
});

test("E2E: Grok Build config transformation - local server", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed);

  const grokAgent = agents["grok-build"];
  const transformed = grokAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.command, "npx");
  assert.deepStrictEqual(transformed.args, ["-y", "mcp-server-postgres"]);
});

test("E2E: Grok Build config transformation - local server includes env", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: {
      OPENAI_API_KEY: "secret",
    },
  });

  const grokAgent = agents["grok-build"];
  const transformed = grokAgent.transformConfig!("postgres", config) as Record<
    string,
    unknown
  >;

  assert.deepStrictEqual(transformed.env, {
    OPENAI_API_KEY: "secret",
  });
});

test("E2E: Write TOML config file (Grok Build format)", () => {
  const tempDir = createTempDir();
  const grokConfigPath = join(tempDir, ".grok", "config.toml");

  const parsed = parseSource("mcp-server-postgres");
  const serverConfig = buildServerConfig(parsed);

  const grokAgent = agents["grok-build"];
  const transformed = grokAgent.transformConfig!("postgres", serverConfig);

  const config = buildConfigWithKey("mcp_servers", "postgres", transformed);
  writeConfig(grokConfigPath, config, "toml", "mcp_servers");

  assert.strictEqual(existsSync(grokConfigPath), true);

  const savedConfig = readTomlConfig(grokConfigPath);
  const mcpServers = savedConfig.mcp_servers as Record<string, unknown>;
  assert.ok(mcpServers);

  const serverEntry = mcpServers.postgres as Record<string, unknown>;
  assert.strictEqual(serverEntry.command, "npx");
  assert.deepStrictEqual(serverEntry.args, ["-y", "mcp-server-postgres"]);
});

test("E2E: Grok re-installs replace the server and preserve other settings", () => {
  const tempDir = createTempDir();
  const configPath = join(tempDir, ".grok", "config.toml");

  writeConfig(
    configPath,
    {
      models: { default: "grok-build" },
      mcp_servers: {
        keep: { url: "https://mcp.example.com/keep" },
      },
    },
    "toml",
    "mcp_servers",
  );

  const stdioConfig = buildServerConfig(parseSource("mcp-server-postgres"), {
    env: { DATABASE_URL: "${DATABASE_URL}" },
  });
  const first = installServerForAgent(
    "switch-transport",
    stdioConfig,
    "grok-build",
    { local: true, cwd: tempDir },
  );
  assert.strictEqual(first.success, true);

  const remoteConfig = buildServerConfig(
    parseSource("https://mcp.example.com/mcp"),
    {
      headers: { Authorization: "Bearer ${API_TOKEN}" },
      timeout: 2000,
    },
  );
  const second = installServerForAgent(
    "switch-transport",
    remoteConfig,
    "grok-build",
    { local: true, cwd: tempDir },
  );
  assert.strictEqual(second.success, true);

  let saved = readTomlConfig(configPath);
  let servers = saved.mcp_servers as Record<string, Record<string, unknown>>;
  let switched = servers["switch-transport"];
  let kept = servers.keep;
  assert.ok(switched);
  assert.ok(kept);
  assert.strictEqual(switched.url, "https://mcp.example.com/mcp");
  assert.deepStrictEqual(switched.headers, {
    Authorization: "Bearer ${API_TOKEN}",
  });
  assert.strictEqual(switched.tool_timeout_sec, 2);
  assert.strictEqual("command" in switched, false);
  assert.strictEqual("args" in switched, false);
  assert.strictEqual("env" in switched, false);
  assert.strictEqual(kept.url, "https://mcp.example.com/keep");
  assert.deepStrictEqual(saved.models, { default: "grok-build" });

  const third = installServerForAgent(
    "switch-transport",
    stdioConfig,
    "grok-build",
    { local: true, cwd: tempDir },
  );
  assert.strictEqual(third.success, true);

  saved = readTomlConfig(configPath);
  servers = saved.mcp_servers as Record<string, Record<string, unknown>>;
  switched = servers["switch-transport"];
  kept = servers.keep;
  assert.ok(switched);
  assert.ok(kept);
  assert.strictEqual(switched.command, "npx");
  assert.deepStrictEqual(switched.args, ["-y", "mcp-server-postgres"]);
  assert.deepStrictEqual(switched.env, {
    DATABASE_URL: "${DATABASE_URL}",
  });
  assert.strictEqual("url" in switched, false);
  assert.strictEqual("headers" in switched, false);
  assert.strictEqual("tool_timeout_sec" in switched, false);
  assert.strictEqual(kept.url, "https://mcp.example.com/keep");
  assert.deepStrictEqual(saved.models, { default: "grok-build" });
});

// ============================================
// E2E Tests: Kiro CLI
// ============================================

test("E2E: Install to Kiro CLI (local) - stdio", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-github");
  const config = buildServerConfig(parsed, {
    env: { GITHUB_TOKEN: "secret" },
  });

  const result = installServerForAgent("github", config, "kiro-cli", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".kiro", "settings", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<
    string,
    Record<string, unknown>
  >;
  const serverConfig = mcpServers.github;
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.command, "npx");
  assert.deepStrictEqual(serverConfig.args, ["-y", "mcp-server-github"]);
  assert.deepStrictEqual(serverConfig.env, { GITHUB_TOKEN: "secret" });
});

test("E2E: Install to Kiro CLI (local) - remote omits the transport type", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/api");
  const config = buildServerConfig(parsed, {
    headers: { Authorization: "Bearer token" },
    timeout: 60000,
  });

  const result = installServerForAgent("example", config, "kiro-cli", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".kiro", "settings", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<
    string,
    Record<string, unknown>
  >;
  const serverConfig = mcpServers.example;
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.url, "https://mcp.example.com/api");
  assert.deepStrictEqual(serverConfig.headers, {
    Authorization: "Bearer token",
  });
  // Kiro infers the transport from url vs command and ignores `type`.
  assert.strictEqual("type" in serverConfig, false);
  // Kiro's timeout is in milliseconds, so it maps over unchanged.
  assert.strictEqual(serverConfig.timeout, 60000);
});

test("E2E: Install to Kiro CLI (global) uses ~/.kiro/settings/mcp.json", () => {
  const kiroAgent = agents["kiro-cli"];
  assert.ok(
    kiroAgent.configPath.endsWith(join(".kiro", "settings", "mcp.json")),
  );
  assert.strictEqual(kiroAgent.localConfigPath, ".kiro/settings/mcp.json");
});

test("E2E: Kiro CLI sse install does not write a type field", () => {
  const parsed = parseSource("https://mcp.example.com/sse");
  const config = buildServerConfig(parsed, { transport: "sse" });

  const transformed = agents["kiro-cli"].transformConfig(
    "example",
    config,
  ) as Record<string, unknown>;

  assert.strictEqual(transformed.url, "https://mcp.example.com/sse");
  assert.strictEqual("type" in transformed, false);
  assert.strictEqual("transport" in transformed, false);
});

// ============================================
// E2E Tests: Kilo Code (OpenCode-style JSON)
// ============================================

test("E2E: Install remote MCP to Kilo Code (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, {
    headers: { Authorization: "Bearer token" },
    timeout: 4000,
  });

  const result = installServerForAgent("example", config, "kilo-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, "kilo.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcp = savedConfig.mcp as Record<string, Record<string, unknown>>;
  const serverConfig = mcp.example;
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.type, "remote");
  assert.strictEqual(serverConfig.url, "https://mcp.example.com/mcp");
  assert.strictEqual(serverConfig.enabled, true);
  assert.deepStrictEqual(serverConfig.headers, {
    Authorization: "Bearer token",
  });
  assert.strictEqual(serverConfig.timeout, 4000);
});

test("E2E: Install local server to Kilo Code uses command array and environment", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: { DATABASE_URL: "postgres://localhost/test" },
  });

  const result = installServerForAgent("postgres", config, "kilo-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const savedConfig = readJsonConfig(join(tempDir, "kilo.json"));
  const mcp = savedConfig.mcp as Record<string, Record<string, unknown>>;
  const serverConfig = mcp.postgres;
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.type, "local");
  assert.deepStrictEqual(serverConfig.command, [
    "npx",
    "-y",
    "mcp-server-postgres",
  ]);
  assert.deepStrictEqual(serverConfig.environment, {
    DATABASE_URL: "postgres://localhost/test",
  });
  assert.strictEqual("timeout" in serverConfig, false);
});

test("E2E: Kilo Code writes to an existing .kilo/kilo.json instead of the project root", () => {
  const tempDir = createTempDir();
  const nestedPath = join(tempDir, ".kilo", "kilo.json");
  mkdirSync(join(tempDir, ".kilo"), { recursive: true });
  writeFileSync(nestedPath, JSON.stringify({ mcp: {} }, null, 2));

  const config = buildServerConfig(parseSource("https://mcp.example.com/mcp"));
  const result = installServerForAgent("example", config, "kilo-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.path, nestedPath);
  assert.strictEqual(existsSync(join(tempDir, "kilo.json")), false);

  const savedConfig = readJsonConfig(nestedPath);
  const mcp = savedConfig.mcp as Record<string, Record<string, unknown>>;
  assert.ok(mcp.example);
});

test("E2E: Kilo Code writes to an existing legacy .kilocode/kilo.json", () => {
  const tempDir = createTempDir();
  const legacyPath = join(tempDir, ".kilocode", "kilo.json");
  mkdirSync(join(tempDir, ".kilocode"), { recursive: true });
  writeFileSync(legacyPath, JSON.stringify({ mcp: {} }, null, 2));

  const config = buildServerConfig(parseSource("https://mcp.example.com/mcp"));
  const result = installServerForAgent("example", config, "kilo-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.path, legacyPath);
  assert.strictEqual(existsSync(join(tempDir, "kilo.json")), false);
});

test("E2E: Kilo Code preserves comments when updating a kilo.jsonc", () => {
  const tempDir = createTempDir();
  const jsoncPath = join(tempDir, "kilo.jsonc");
  writeFileSync(
    jsoncPath,
    '{\n  // keep me\n  "mcp": {\n    "keep": { "type": "remote", "url": "https://keep.example.com/mcp" }\n  }\n}\n',
  );

  const config = buildServerConfig(parseSource("https://mcp.example.com/mcp"));
  const result = installServerForAgent("example", config, "kilo-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.path, jsoncPath);

  const content = readFileSync(jsoncPath, "utf-8");
  assert.ok(content.includes("// keep me"));
  assert.ok(content.includes("https://keep.example.com/mcp"));
  assert.ok(content.includes("https://mcp.example.com/mcp"));
});

// ============================================
// E2E Tests: Kimi Code (mcpServers with transport)
// ============================================

test("E2E: Install remote MCP to Kimi Code (local)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, {
    headers: { Authorization: "Bearer token" },
    timeout: 5000,
  });

  const result = installServerForAgent("example", config, "kimi-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const configPath = join(tempDir, ".kimi-code", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = readJsonConfig(configPath);
  const mcpServers = savedConfig.mcpServers as Record<
    string,
    Record<string, unknown>
  >;
  const serverConfig = mcpServers.example;
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.transport, "http");
  assert.strictEqual(serverConfig.url, "https://mcp.example.com/mcp");
  assert.deepStrictEqual(serverConfig.headers, {
    Authorization: "Bearer token",
  });
  assert.strictEqual(serverConfig.toolTimeoutMs, 5000);
  assert.strictEqual("type" in serverConfig, false);
});

test("E2E: Install sse MCP to Kimi Code keeps an explicit transport", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("https://mcp.example.com/sse");
  const config = buildServerConfig(parsed, { transport: "sse" });

  const result = installServerForAgent("example-sse", config, "kimi-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const savedConfig = readJsonConfig(join(tempDir, ".kimi-code", "mcp.json"));
  const mcpServers = savedConfig.mcpServers as Record<
    string,
    Record<string, unknown>
  >;
  const serverConfig = mcpServers["example-sse"];
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.transport, "sse");
  assert.strictEqual(serverConfig.url, "https://mcp.example.com/sse");
});

test("E2E: Install local server to Kimi Code (stdio)", () => {
  const tempDir = createTempDir();
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: { DATABASE_URL: "postgres://localhost/test" },
  });

  const result = installServerForAgent("postgres", config, "kimi-code", {
    local: true,
    cwd: tempDir,
  });

  assert.strictEqual(result.success, true);

  const savedConfig = readJsonConfig(join(tempDir, ".kimi-code", "mcp.json"));
  const mcpServers = savedConfig.mcpServers as Record<
    string,
    Record<string, unknown>
  >;
  const serverConfig = mcpServers.postgres;
  assert.ok(serverConfig);
  assert.strictEqual(serverConfig.transport, "stdio");
  assert.strictEqual(serverConfig.command, "npx");
  assert.deepStrictEqual(serverConfig.args, ["-y", "mcp-server-postgres"]);
  assert.deepStrictEqual(serverConfig.env, {
    DATABASE_URL: "postgres://localhost/test",
  });
});

test("E2E: Kimi Code drops a timeout its schema would reject", () => {
  const parsed = parseSource("https://mcp.example.com/mcp");
  const config = buildServerConfig(parsed, {
    timeout: Number.MAX_SAFE_INTEGER,
  });

  const transformed = agents["kimi-code"].transformConfig(
    "example",
    config,
  ) as Record<string, unknown>;

  assert.strictEqual("toolTimeoutMs" in transformed, false);
  assert.strictEqual(transformed.url, "https://mcp.example.com/mcp");
});

test("E2E: fx stdio transform uses a command array and environment", () => {
  const parsed = parseSource("mcp-server-postgres");
  const config = buildServerConfig(parsed, {
    env: { DATABASE_URL: "postgres://localhost/test" },
  });

  const transformed = agents.fx.transformConfig("postgres", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.type, "local");
  assert.deepStrictEqual(transformed.command, [
    "npx",
    "-y",
    "mcp-server-postgres",
  ]);
  assert.deepStrictEqual(transformed.environment, {
    DATABASE_URL: "postgres://localhost/test",
  });
  assert.strictEqual(transformed.enabled, true);
  assert.strictEqual("args" in transformed, false);
  assert.strictEqual("env" in transformed, false);
});

test("E2E: fx stdio transform omits empty environment", () => {
  const config = buildServerConfig(parseSource("mcp-server-github"));
  const transformed = agents.fx.transformConfig("github", config) as Record<
    string,
    unknown
  >;

  assert.strictEqual(transformed.type, "local");
  assert.strictEqual("environment" in transformed, false);
});

test("E2E: fx remote transform writes http or sse plus headers", () => {
  const httpConfig = buildServerConfig(
    parseSource("https://mcp.example.com/mcp"),
    {
      headers: { "X-Workspace": "demo" },
    },
  );
  const http = agents.fx.transformConfig("example", httpConfig) as Record<
    string,
    unknown
  >;
  assert.strictEqual(http.type, "http");
  assert.strictEqual(http.url, "https://mcp.example.com/mcp");
  assert.strictEqual(http.enabled, true);
  assert.deepStrictEqual(http.headers, { "X-Workspace": "demo" });

  const sseConfig = buildServerConfig(
    parseSource("https://mcp.example.com/sse"),
    {
      transport: "sse",
    },
  );
  const sse = agents.fx.transformConfig("example-sse", sseConfig) as Record<
    string,
    unknown
  >;
  assert.strictEqual(sse.type, "sse");
  assert.strictEqual(sse.url, "https://mcp.example.com/sse");
  assert.strictEqual("headers" in sse, false);
});

test("E2E: fx remote transform rejects a literal Authorization header", () => {
  const config = buildServerConfig(parseSource("https://mcp.example.com/mcp"), {
    headers: { Authorization: "Bearer token" },
  });

  assert.throws(
    () => agents.fx.transformConfig("example", config),
    /--bearer-token-env/,
  );
});

test("E2E: fx is global-only and writes ~/.fx/mcp.json", () => {
  assert.ok(agents.fx.configPath.endsWith(join(".fx", "mcp.json")));
  assert.strictEqual(agents.fx.localConfigPath, undefined);
  assert.deepStrictEqual(agents.fx.projectDetectPaths, []);
  assert.strictEqual(agents.fx.configKey, "mcp");
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
