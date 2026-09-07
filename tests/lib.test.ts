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
  writeFileSync,
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

  const written = readJson(join(dir, ".mcp.json"));
  const server = (written.mcpServers as Record<string, Record<string, unknown>>)
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
  assert.strictEqual(existsSync(join(dir, ".mcp.json")), false);
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
  assert.strictEqual(existsSync(join(dir, ".mcp.json")), false);
});

await test("upsertServer + removeServer honor github-copilot-cli local mcpServers key", () => {
  const dir = createTempDir();

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);

  const written = readJson(join(dir, ".mcp.json"));
  assert.ok(
    written.mcpServers && (written.mcpServers as Record<string, unknown>).ghc,
    "expected `mcpServers.ghc` under local github-copilot-cli config",
  );
  assert.strictEqual(
    written.servers,
    undefined,
    "expected no `servers` key under local copilot config",
  );
  const ghc = (written.mcpServers as Record<string, Record<string, unknown>>)
    .ghc;
  assert.ok(ghc);
  assert.strictEqual(ghc.type, "http");
  assert.strictEqual(ghc.url, "https://mcp.example.com/api");
  assert.strictEqual("tools" in ghc, false);

  const removed = removeServer("github-copilot-cli", "ghc", {
    local: true,
    cwd: dir,
  });
  assert.ok(removed.success);
  assert.strictEqual(removed.removed, true);

  const after = readJson(join(dir, ".mcp.json"));
  const mcpServers = (after.mcpServers ?? {}) as Record<string, unknown>;
  assert.ok(!mcpServers.ghc, "ghc should be removed from local mcpServers key");
});

await test("github-copilot-cli local reuses .github/mcp.json when .mcp.json is absent", () => {
  const dir = createTempDir();
  mkdirSync(join(dir, ".github"), { recursive: true });
  writeFileSync(
    join(dir, ".github", "mcp.json"),
    JSON.stringify({
      mcpServers: {
        existing: { type: "http", url: "https://existing.example.com/mcp" },
      },
    }),
  );

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  assert.ok(installed.path.endsWith(join(".github", "mcp.json")));
  assert.strictEqual(existsSync(join(dir, ".mcp.json")), false);

  const written = readJson(join(dir, ".github", "mcp.json"));
  const servers = written.mcpServers as Record<string, unknown>;
  assert.ok(servers.existing);
  assert.ok(servers.ghc);
});

await test("github-copilot-cli local prefers .mcp.json over .github/mcp.json", () => {
  const dir = createTempDir();
  mkdirSync(join(dir, ".github"), { recursive: true });
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
  writeFileSync(
    join(dir, ".github", "mcp.json"),
    JSON.stringify({
      mcpServers: { hidden: { url: "https://hidden.example" } },
    }),
  );

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  assert.ok(installed.path.endsWith(".mcp.json"));

  const mcp = readJson(join(dir, ".mcp.json"));
  assert.ok((mcp.mcpServers as Record<string, unknown>).ghc);
  const github = readJson(join(dir, ".github", "mcp.json"));
  assert.ok((github.mcpServers as Record<string, unknown>).hidden);
  assert.strictEqual(
    (github.mcpServers as Record<string, unknown>).ghc,
    undefined,
  );
});

await test("github-copilot-cli local does not write .vscode/mcp.json", () => {
  const dir = createTempDir();
  mkdirSync(join(dir, ".vscode"));
  const vscodePath = join(dir, ".vscode", "mcp.json");
  const original = '{"servers":{"keep":{"command":"npx"}}}\n';
  writeFileSync(vscodePath, original);

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  assert.strictEqual(readFileSync(vscodePath, "utf-8"), original);
  assert.ok(existsSync(join(dir, ".mcp.json")));
});

await test("github-copilot-cli list and remove work on a bare project map", async () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({
      ghc: { type: "http", url: "https://mcp.example.com/api" },
    }),
  );

  const listed = await listInstalledServers({
    agents: ["github-copilot-cli"],
    cwd: dir,
  });
  const copilot = listed.find((a) => a.agentType === "github-copilot-cli");
  assert.ok(copilot);
  assert.strictEqual(copilot.servers[0]?.serverName, "ghc");
  assert.strictEqual(copilot.servers[0]?.configKey, "");

  const removed = removeServer("github-copilot-cli", "ghc", {
    local: true,
    cwd: dir,
  });
  assert.ok(removed.success);
  assert.strictEqual(removed.removed, true);
  const after = readJson(join(dir, ".mcp.json"));
  assert.strictEqual(after.ghc, undefined);
});

await test("github-copilot-cli upsert adds to a bare project map without wrapping", () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({
      existing: { type: "http", url: "https://existing.example.com/mcp" },
    }),
  );

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  const written = readJson(join(dir, ".mcp.json"));
  assert.strictEqual(written.mcpServers, undefined);
  assert.ok(written.existing);
  assert.ok(written.ghc);
});

await test("github-copilot-cli rejects a VS Code servers wrapper at .mcp.json", () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({
      servers: { keep: { command: "npx" } },
    }),
  );
  const original = readFileSync(join(dir, ".mcp.json"), "utf-8");

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(installed.success, false);
  assert.ok(installed.error?.includes("servers"));
  assert.strictEqual(readFileSync(join(dir, ".mcp.json"), "utf-8"), original);
});

await test("github-copilot-cli treats a bare server named servers as a server map", () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({
      servers: { type: "http", url: "https://named-servers.example.com/mcp" },
    }),
  );

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  const written = readJson(join(dir, ".mcp.json"));
  assert.ok(written.servers);
  assert.ok(written.ghc);
  assert.strictEqual(written.mcpServers, undefined);
});

await test("github-copilot-cli refuses malformed project JSON and leaves the file", () => {
  const dir = createTempDir();
  const path = join(dir, ".mcp.json");
  writeFileSync(path, "{ not json");

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(installed.success, false);
  assert.ok(installed.error?.includes(path));
  assert.strictEqual(readFileSync(path, "utf-8"), "{ not json");
});

await test("github-copilot-cli refuses bare-word project JSON and leaves the file", () => {
  const dir = createTempDir();
  const path = join(dir, ".mcp.json");
  writeFileSync(path, "not json");

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(installed.success, false);
  assert.ok(installed.error?.includes(path));
  assert.strictEqual(readFileSync(path, "utf-8"), "not json");
});

await test("github-copilot-cli refuses an unterminated comment and leaves the file", () => {
  const dir = createTempDir();
  const path = join(dir, ".mcp.json");
  writeFileSync(path, "/* unterminated");

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(installed.success, false);
  assert.ok(installed.error?.includes(path));
  assert.strictEqual(readFileSync(path, "utf-8"), "/* unterminated");
});

await test("github-copilot-cli installs into an empty .mcp.json", () => {
  const dir = createTempDir();
  writeFileSync(join(dir, ".mcp.json"), "");

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  const written = readJson(join(dir, ".mcp.json"));
  const ghc = (written.mcpServers as Record<string, Record<string, unknown>>)
    .ghc;
  assert.ok(ghc);
  assert.strictEqual(ghc.url, "https://mcp.example.com/api");
});

await test("github-copilot-cli installs into a comment-only .mcp.json", () => {
  const dir = createTempDir();
  writeFileSync(join(dir, ".mcp.json"), "// MCP configuration\n");

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  const text = readFileSync(join(dir, ".mcp.json"), "utf-8");
  assert.doesNotMatch(text, /^\s*\/\//m);
  const written = readJson(join(dir, ".mcp.json"));
  const ghc = (written.mcpServers as Record<string, Record<string, unknown>>)
    .ghc;
  assert.ok(ghc);
  assert.strictEqual(ghc.url, "https://mcp.example.com/api");
});

await test("listInstalledServers continues when .mcp.json is empty beside VS Code", async () => {
  const dir = createTempDir();
  writeFileSync(join(dir, ".mcp.json"), "");
  mkdirSync(join(dir, ".vscode"), { recursive: true });
  writeFileSync(
    join(dir, ".vscode", "mcp.json"),
    JSON.stringify({
      servers: { keep: { url: "https://keep.example.com/mcp" } },
    }),
  );

  const list = await listInstalledServers({ cwd: dir });
  const vscode = list.find((a) => a.agentType === "vscode");
  assert.ok(vscode);
  assert.deepStrictEqual(
    vscode.servers.map((s) => s.serverName),
    ["keep"],
  );
});

await test("listInstalledServers continues when .mcp.json is comment-only beside VS Code", async () => {
  const dir = createTempDir();
  writeFileSync(join(dir, ".mcp.json"), "// MCP configuration\n");
  mkdirSync(join(dir, ".vscode"), { recursive: true });
  writeFileSync(
    join(dir, ".vscode", "mcp.json"),
    JSON.stringify({
      servers: { keep: { url: "https://keep.example.com/mcp" } },
    }),
  );

  const list = await listInstalledServers({ cwd: dir });
  const vscode = list.find((a) => a.agentType === "vscode");
  assert.ok(vscode);
  assert.deepStrictEqual(
    vscode.servers.map((s) => s.serverName),
    ["keep"],
  );
});

await test("listInstalledServers reports Invalid JSON on bare-word .mcp.json without throwing", async () => {
  const dir = createTempDir();
  writeFileSync(join(dir, ".mcp.json"), "not json");
  const list = await listInstalledServers({ cwd: dir });
  const copilot = list.find((a) => a.agentType === "github-copilot-cli");
  assert.ok(copilot?.error?.includes("Invalid JSON"));
});

await test("claude-code install lifts a Copilot bare .mcp.json into mcpServers", () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    JSON.stringify({
      keep: { type: "http", url: "https://keep.example.com/mcp" },
    }),
  );

  const installed = upsertServer(
    "claude-code",
    "claude",
    remote("https://claude.example.com/mcp"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);

  const written = readJson(join(dir, ".mcp.json"));
  assert.strictEqual(written.keep, undefined);
  const servers = written.mcpServers as Record<string, Record<string, unknown>>;
  const keep = servers.keep;
  const claude = servers.claude;
  assert.ok(keep);
  assert.ok(claude);
  assert.strictEqual(keep.url, "https://keep.example.com/mcp");
  assert.strictEqual(claude.url, "https://claude.example.com/mcp");
});

await test("github-copilot-cli strips comments from an existing project file", () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    `{
  // keep this comment
  "mcpServers": {
    "old": { "type": "http", "url": "https://old.example.com/mcp" }
  }
}
`,
  );

  const installed = upsertServer(
    "github-copilot-cli",
    "ghc",
    remote("https://mcp.example.com/api"),
    { local: true, cwd: dir },
  );
  assert.ok(installed.success, installed.error);
  const text = readFileSync(join(dir, ".mcp.json"), "utf-8");
  assert.doesNotMatch(text, /^\s*\/\//m);
  const written = readJson(join(dir, ".mcp.json"));
  const servers = written.mcpServers as Record<string, Record<string, unknown>>;
  assert.ok(servers.old);
  assert.ok(servers.ghc);
});

await test("claude-code refuses to create .mcp.json that hides .github/mcp.json", () => {
  const dir = createTempDir();
  mkdirSync(join(dir, ".github"), { recursive: true });
  writeFileSync(
    join(dir, ".github", "mcp.json"),
    JSON.stringify({
      mcpServers: {
        keep: { type: "http", url: "https://keep.example.com/mcp" },
      },
    }),
  );

  const installed = upsertServer(
    "claude-code",
    "claude",
    remote("https://claude.example.com/mcp"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(installed.success, false);
  assert.ok(installed.error?.includes(".github/mcp.json"));
  assert.ok(installed.error?.includes("Merge the servers"));
  assert.strictEqual(existsSync(join(dir, ".mcp.json")), false);
});

await test("listInstalledServers reports a Copilot read error without dropping VS Code", async () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, ".mcp.json"),
    `{
  "mcpServers": {
    "keep": { "url": "https://copilot.example.com/mcp" },
  }
}
`,
  );
  mkdirSync(join(dir, ".vscode"), { recursive: true });
  writeFileSync(
    join(dir, ".vscode", "mcp.json"),
    JSON.stringify({
      servers: { vscode: { url: "https://vscode.example.com/mcp" } },
    }),
  );

  const list = await listInstalledServers({ cwd: dir });
  const vscode = list.find((a) => a.agentType === "vscode");
  const copilot = list.find((a) => a.agentType === "github-copilot-cli");
  assert.ok(vscode);
  assert.deepStrictEqual(
    vscode.servers.map((s) => s.serverName),
    ["vscode"],
  );
  assert.ok(copilot);
  assert.ok(copilot.error?.includes("Invalid JSON"));
  assert.ok(copilot.error?.includes(join(dir, ".mcp.json")));
  assert.deepStrictEqual(copilot.servers, []);
});

await test("opencode lists mixed files and reports native configKey", async () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, "opencode.jsonc"),
    JSON.stringify({
      mcp: {
        timeout: { startup: 4000 },
        legacy: { type: "remote", url: "https://legacy.example.com/mcp" },
        dup: { type: "remote", url: "https://legacy-dup.example.com/mcp" },
        servers: {
          native: {
            type: "local",
            command: ["npx", "-y", "mcp-server-postgres"],
          },
          dup: { type: "remote", url: "https://native-dup.example.com/mcp" },
        },
      },
    }),
  );

  const list = await listInstalledServers({
    agents: ["opencode"],
    cwd: dir,
  });
  const opencode = list.find((a) => a.agentType === "opencode");
  assert.ok(opencode);
  assert.strictEqual(opencode.error, undefined);
  const byName = new Map(opencode.servers.map((s) => [s.serverName, s]));
  assert.strictEqual(byName.get("legacy")?.configKey, "mcp");
  assert.strictEqual(byName.get("native")?.configKey, "mcp.servers");
  assert.strictEqual(byName.get("dup")?.configKey, "mcp.servers");
  assert.strictEqual(
    byName.get("dup")?.identity,
    "https://native-dup.example.com/mcp",
  );
  assert.strictEqual(byName.get("native")?.identity, "mcp-server-postgres");
});

await test("opencode remove deletes both maps for a duplicate name", async () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, "opencode.jsonc"),
    JSON.stringify({
      theme: "dark",
      mcp: {
        timeout: { startup: 4000 },
        dup: { type: "remote", url: "https://legacy.example.com/mcp" },
        servers: {
          dup: { type: "remote", url: "https://native.example.com/mcp" },
        },
      },
    }),
  );

  const removed = removeServer("opencode", "dup", { local: true, cwd: dir });
  assert.ok(removed.success);
  assert.strictEqual(removed.removed, true);

  const listed = await listInstalledServers({ agents: ["opencode"], cwd: dir });
  assert.deepStrictEqual(listed[0]?.servers, []);

  const parsed = readJson(join(dir, "opencode.jsonc"));
  const mcp = parsed.mcp as Record<string, unknown>;
  assert.strictEqual(parsed.theme, "dark");
  assert.deepStrictEqual(mcp.timeout, { startup: 4000 });
  assert.deepStrictEqual(mcp.servers, {});
  assert.strictEqual(mcp.dup, undefined);

  const again = removeServer("opencode", "dup", { local: true, cwd: dir });
  assert.ok(again.success);
  assert.strictEqual(again.removed, false);
});

await test("opencode upsert and list refuse truncated JSONC and leave the file", async () => {
  const dir = createTempDir();
  const truncated = `{
  "mcp": {
    "keep": { "type": "remote", "url": "https://keep.example.com/mcp"
`;
  const path = join(dir, "opencode.jsonc");
  writeFileSync(path, truncated);

  const upsert = upsertServer(
    "opencode",
    "example",
    remote("https://mcp.example.com/mcp"),
    { local: true, cwd: dir },
  );
  assert.strictEqual(upsert.success, false);
  assert.ok(upsert.error?.includes("Invalid JSON"));
  assert.ok(upsert.error?.includes(path));

  const removed = removeServer("opencode", "keep", { local: true, cwd: dir });
  assert.strictEqual(removed.success, false);
  assert.ok(removed.error?.includes("Invalid JSON"));
  assert.ok(removed.error?.includes(path));

  const list = await listInstalledServers({ agents: ["opencode"], cwd: dir });
  const opencode = list.find((a) => a.agentType === "opencode");
  assert.ok(opencode);
  assert.ok(opencode.error?.includes("Invalid JSON"));
  assert.ok(opencode.error?.includes(path));
  assert.deepStrictEqual(opencode.servers, []);
  assert.strictEqual(readFileSync(path, "utf-8"), truncated);
});

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
