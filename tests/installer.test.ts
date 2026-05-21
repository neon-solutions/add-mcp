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
  updateGitignoreWithPaths,
} from "../src/installer.js";
import { agents } from "../src/agents.js";
import { parseSource } from "../src/source-parser.js";
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
