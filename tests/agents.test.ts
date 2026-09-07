#!/usr/bin/env tsx

/**
 * Unit tests for agents.ts - detection and routing functions
 *
 * Run with: npx tsx tests/agents.test.ts
 */

import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agents,
  getAgentTypes,
  supportsProjectConfig,
  getCommonInstallScopes,
  getProjectCapableAgents,
  getGlobalOnlyAgents,
  detectProjectAgents,
  isTransportSupported,
  buildAgentSelectionChoices,
} from "../src/agents.js";
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
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-agents-test-"));
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

// ============================================
// Agent Configuration Tests
// ============================================

test("getAgentTypes returns all 20 agents", () => {
  const types = getAgentTypes();
  assert.strictEqual(types.length, 20);
  assert.ok(types.includes("antigravity"));
  assert.ok(types.includes("cline"));
  assert.ok(types.includes("cline-cli"));
  assert.ok(types.includes("claude-code"));
  assert.ok(types.includes("claude-desktop"));
  assert.ok(types.includes("codex"));
  assert.ok(types.includes("cursor"));
  assert.ok(types.includes("fx"));
  assert.ok(types.includes("gemini-cli"));
  assert.ok(types.includes("goose"));
  assert.ok(types.includes("github-copilot-cli"));
  assert.ok(types.includes("grok-build"));
  assert.ok(types.includes("kilo-code"));
  assert.ok(types.includes("kimi-code"));
  assert.ok(types.includes("kiro-cli"));
  assert.ok(types.includes("mcporter"));
  assert.ok(types.includes("opencode"));
  assert.ok(types.includes("vscode"));
  assert.ok(types.includes("windsurf"));
  assert.ok(types.includes("zed"));
});

test("All agents have required properties", () => {
  for (const [type, config] of Object.entries(agents)) {
    assert.ok(config.name, `${type} missing name`);
    assert.ok(config.displayName, `${type} missing displayName`);
    assert.ok(config.configPath, `${type} missing configPath`);
    assert.ok(config.configKey, `${type} missing configKey`);
    assert.ok(config.format, `${type} missing format`);
    assert.ok(
      Array.isArray(config.supportedTransports),
      `${type} missing supportedTransports`,
    );
    assert.ok(
      Array.isArray(config.projectDetectPaths),
      `${type} missing projectDetectPaths`,
    );
    assert.ok(
      typeof config.detectGlobalInstall === "function",
      `${type} missing detectGlobalInstall`,
    );
    assert.ok(
      Array.isArray(config.supportedFields),
      `${type} missing supportedFields`,
    );
    assert.ok(
      typeof config.transformConfig === "function",
      `${type} missing required transformConfig`,
    );
  }
});

test("Every agent declares a transformConfig so no raw config can leak", () => {
  // transformConfig is required: a missing transform used to mean the raw
  // McpServerConfig was written verbatim, which could leak unknown fields.
  for (const type of getAgentTypes()) {
    assert.strictEqual(
      typeof agents[type].transformConfig,
      "function",
      `${type} must define transformConfig`,
    );
  }
});

test("supportedFields reflects per-client capabilities", () => {
  assert.deepStrictEqual(agents.cursor.supportedFields, ["scopes"]);
  assert.deepStrictEqual(agents["gemini-cli"].supportedFields, [
    "timeout",
    "scopes",
  ]);
  assert.deepStrictEqual(agents["claude-code"].supportedFields, [
    "timeout",
    "autoApprove",
  ]);
  assert.deepStrictEqual(agents.codex.supportedFields, ["autoApprove"]);
  assert.deepStrictEqual(agents["grok-build"].supportedFields, ["timeout"]);
  assert.deepStrictEqual(agents["kilo-code"].supportedFields, ["timeout"]);
  assert.deepStrictEqual(agents["kimi-code"].supportedFields, ["timeout"]);
  assert.deepStrictEqual(agents["kiro-cli"].supportedFields, ["timeout"]);
  // Clients with no extra field support declare an empty list.
  assert.deepStrictEqual(agents.vscode.supportedFields, []);
  assert.deepStrictEqual(agents["claude-desktop"].supportedFields, []);
  assert.deepStrictEqual(agents.fx.supportedFields, ["bearerTokenEnv"]);
});

// ============================================
// Project Support Tests
// ============================================

test("supportsProjectConfig - returns true for project-capable agents", () => {
  assert.strictEqual(supportsProjectConfig("claude-code"), true);
  assert.strictEqual(supportsProjectConfig("cursor"), true);
  assert.strictEqual(supportsProjectConfig("vscode"), true);
  assert.strictEqual(supportsProjectConfig("opencode"), true);
  assert.strictEqual(supportsProjectConfig("gemini-cli"), true);
  assert.strictEqual(supportsProjectConfig("github-copilot-cli"), true);
  assert.strictEqual(supportsProjectConfig("grok-build"), true);
  assert.strictEqual(supportsProjectConfig("kilo-code"), true);
  assert.strictEqual(supportsProjectConfig("kimi-code"), true);
  assert.strictEqual(supportsProjectConfig("kiro-cli"), true);
  assert.strictEqual(supportsProjectConfig("mcporter"), true);
  assert.strictEqual(supportsProjectConfig("codex"), true);
  assert.strictEqual(supportsProjectConfig("zed"), true);
});

test("supportsProjectConfig - returns false for global-only agents", () => {
  assert.strictEqual(supportsProjectConfig("antigravity"), false);
  assert.strictEqual(supportsProjectConfig("cline"), false);
  assert.strictEqual(supportsProjectConfig("cline-cli"), false);
  assert.strictEqual(supportsProjectConfig("claude-desktop"), false);
  assert.strictEqual(supportsProjectConfig("goose"), false);
  assert.strictEqual(supportsProjectConfig("windsurf"), false);
  assert.strictEqual(supportsProjectConfig("fx"), false);
});

test("getProjectCapableAgents returns 13 agents", () => {
  const projectAgents = getProjectCapableAgents();
  assert.strictEqual(projectAgents.length, 13);
  assert.ok(projectAgents.includes("claude-code"));
  assert.ok(projectAgents.includes("cursor"));
  assert.ok(projectAgents.includes("vscode"));
  assert.ok(projectAgents.includes("opencode"));
  assert.ok(projectAgents.includes("gemini-cli"));
  assert.ok(projectAgents.includes("github-copilot-cli"));
  assert.ok(projectAgents.includes("grok-build"));
  assert.ok(projectAgents.includes("kilo-code"));
  assert.ok(projectAgents.includes("kimi-code"));
  assert.ok(projectAgents.includes("kiro-cli"));
  assert.ok(projectAgents.includes("mcporter"));
  assert.ok(projectAgents.includes("codex"));
  assert.ok(projectAgents.includes("zed"));
});

test("getGlobalOnlyAgents returns 7 agents", () => {
  const globalAgents = getGlobalOnlyAgents();
  assert.strictEqual(globalAgents.length, 7);
  assert.ok(globalAgents.includes("antigravity"));
  assert.ok(globalAgents.includes("cline"));
  assert.ok(globalAgents.includes("cline-cli"));
  assert.ok(globalAgents.includes("claude-desktop"));
  assert.ok(globalAgents.includes("goose"));
  assert.ok(globalAgents.includes("windsurf"));
  assert.ok(globalAgents.includes("fx"));
});

test("Project + global-only agents equals all agents", () => {
  const projectAgents = getProjectCapableAgents();
  const globalAgents = getGlobalOnlyAgents();
  const allAgents = getAgentTypes();

  const combined = [...projectAgents, ...globalAgents].sort();
  const all = [...allAgents].sort();

  assert.deepStrictEqual(combined, all);
});

test("getCommonInstallScopes returns project and global for project-capable agents", () => {
  assert.deepStrictEqual(getCommonInstallScopes(["cursor", "codex"]), [
    "local",
    "global",
  ]);
});

test("getCommonInstallScopes returns global for global-only agents", () => {
  assert.deepStrictEqual(getCommonInstallScopes(["claude-desktop"]), [
    "global",
  ]);
});

test("getCommonInstallScopes returns global when selection mixes capabilities", () => {
  assert.deepStrictEqual(getCommonInstallScopes(["cursor", "claude-desktop"]), [
    "global",
  ]);
});

// ============================================
// Project Detection Tests
// ============================================

test("detectProjectAgents - empty directory returns empty array", () => {
  const tempDir = createTempDir();
  const detected = detectProjectAgents(tempDir);
  assert.deepStrictEqual(detected, []);
});

test("detectProjectAgents - detects .cursor directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".cursor"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("cursor"));
});

test("detectProjectAgents - detects .vscode directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".vscode"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("vscode"));
  assert.ok(!detected.includes("github-copilot-cli"));
});

test("detectProjectAgents - detects .mcp.json file (claude-code and github-copilot-cli)", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, ".mcp.json"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("claude-code"));
  assert.ok(detected.includes("github-copilot-cli"));
});

test("detectProjectAgents - detects .claude directory (claude-code)", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".claude"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("claude-code"));
});

test("detectProjectAgents - detects opencode.json file", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "opencode.json"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("opencode"));
});

test("detectProjectAgents - detects .opencode directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".opencode"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("opencode"));
});

test("detectProjectAgents - detects opencode.jsonc file", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "opencode.jsonc"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("opencode"));
});

test("resolveConfigPath local - prefers existing opencode.jsonc over .json", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "opencode.jsonc"), "{}");
  writeFileSync(join(tempDir, "opencode.json"), "{}");

  const resolver = agents.opencode.resolveConfigPath!;
  const result = resolver(agents.opencode, { local: true, cwd: tempDir });
  assert.equal(result, join(tempDir, "opencode.jsonc"));
});

test("resolveConfigPath local - falls through to .opencode/opencode.jsonc", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".opencode"));
  writeFileSync(join(tempDir, ".opencode", "opencode.jsonc"), "{}");

  const resolver = agents.opencode.resolveConfigPath!;
  const result = resolver(agents.opencode, { local: true, cwd: tempDir });
  assert.equal(result, join(tempDir, ".opencode", "opencode.jsonc"));
});

test("resolveConfigPath local - falls through to .opencode/opencode.json", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".opencode"));
  writeFileSync(join(tempDir, ".opencode", "opencode.json"), "{}");

  const resolver = agents.opencode.resolveConfigPath!;
  const result = resolver(agents.opencode, { local: true, cwd: tempDir });
  assert.equal(result, join(tempDir, ".opencode", "opencode.json"));
});

test("resolveConfigPath local - defaults to opencode.jsonc when nothing exists", () => {
  const tempDir = createTempDir();

  const resolver = agents.opencode.resolveConfigPath!;
  const result = resolver(agents.opencode, { local: true, cwd: tempDir });
  assert.equal(result, join(tempDir, "opencode.jsonc"));
});

test("resolveConfigPath local - github-copilot-cli prefers .mcp.json", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, ".mcp.json"), "{}");
  mkdirSync(join(tempDir, ".github"), { recursive: true });
  writeFileSync(join(tempDir, ".github", "mcp.json"), "{}");

  const resolver = agents["github-copilot-cli"].resolveConfigPath!;
  const result = resolver(agents["github-copilot-cli"], {
    local: true,
    cwd: tempDir,
  });
  assert.equal(result, join(tempDir, ".mcp.json"));
});

test("resolveConfigPath local - github-copilot-cli reuses .github/mcp.json", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".github"), { recursive: true });
  writeFileSync(join(tempDir, ".github", "mcp.json"), "{}");

  const resolver = agents["github-copilot-cli"].resolveConfigPath!;
  const result = resolver(agents["github-copilot-cli"], {
    local: true,
    cwd: tempDir,
  });
  assert.equal(result, join(tempDir, ".github", "mcp.json"));
});

test("resolveConfigPath local - github-copilot-cli defaults to .mcp.json", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".vscode"));
  writeFileSync(join(tempDir, ".vscode", "mcp.json"), "{}");

  const resolver = agents["github-copilot-cli"].resolveConfigPath!;
  const result = resolver(agents["github-copilot-cli"], {
    local: true,
    cwd: tempDir,
  });
  assert.equal(result, join(tempDir, ".mcp.json"));
});

test("detectProjectAgents - detects .github/mcp.json for github-copilot-cli", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".github"), { recursive: true });
  writeFileSync(join(tempDir, ".github", "mcp.json"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("github-copilot-cli"));
  assert.ok(!detected.includes("vscode"));
});

test("detectProjectAgents - detects .gemini directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".gemini"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("gemini-cli"));
});

test("detectProjectAgents - detects .codex directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".codex"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("codex"));
});

test("detectProjectAgents - detects .grok directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".grok"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("grok-build"));
});

test("detectProjectAgents - detects .kilo and .kilocode directories", () => {
  const kiloDir = createTempDir();
  mkdirSync(join(kiloDir, ".kilo"));
  assert.ok(detectProjectAgents(kiloDir).includes("kilo-code"));

  const legacyDir = createTempDir();
  mkdirSync(join(legacyDir, ".kilocode"));
  assert.ok(detectProjectAgents(legacyDir).includes("kilo-code"));
});

test("detectProjectAgents - detects kilo.json file", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "kilo.json"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("kilo-code"));
});

// A project may carry only kilo.jsonc, which resolveKiloCodeConfigPath writes
// to, so detection has to recognize it too.
test("detectProjectAgents - detects kilo.jsonc file", () => {
  const tempDir = createTempDir();
  writeFileSync(join(tempDir, "kilo.jsonc"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("kilo-code"));
});

test("detectProjectAgents - detects .kimi-code directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".kimi-code"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("kimi-code"));
});

test("detectProjectAgents - detects .kiro directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".kiro"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("kiro-cli"));
});

test("detectProjectAgents - detects .zed directory", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".zed"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("zed"));
});

test("detectProjectAgents - detects config/mcporter.json", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, "config"), { recursive: true });
  writeFileSync(join(tempDir, "config", "mcporter.json"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.ok(detected.includes("mcporter"));
});

test("detectProjectAgents - detects multiple agents", () => {
  const tempDir = createTempDir();
  mkdirSync(join(tempDir, ".cursor"));
  mkdirSync(join(tempDir, ".vscode"));
  writeFileSync(join(tempDir, ".mcp.json"), "{}");

  const detected = detectProjectAgents(tempDir);
  assert.strictEqual(detected.length, 4);
  assert.ok(detected.includes("cursor"));
  assert.ok(detected.includes("vscode"));
  assert.ok(detected.includes("github-copilot-cli"));
  assert.ok(detected.includes("claude-code"));
});

test("detectProjectAgents - does not detect global-only agents", () => {
  const tempDir = createTempDir();
  // Even if we create directories that might look like agent configs,
  // global-only agents should never be detected via project detection
  mkdirSync(join(tempDir, ".cursor"));
  mkdirSync(join(tempDir, ".goose"));

  const detected = detectProjectAgents(tempDir);
  assert.ok(!detected.includes("cline"));
  assert.ok(!detected.includes("cline-cli"));
  assert.ok(!detected.includes("claude-desktop"));
  assert.ok(!detected.includes("goose"));
  assert.ok(!detected.includes("windsurf"));
  assert.ok(!detected.includes("antigravity"));
  assert.ok(!detected.includes("fx"));
});

// ============================================
// Transport Support Tests
// ============================================

test("isTransportSupported - all agents support stdio", () => {
  for (const type of getAgentTypes()) {
    assert.strictEqual(
      isTransportSupported(type, "stdio"),
      true,
      `${type} should support stdio`,
    );
  }
});

test("isTransportSupported - most agents support http", () => {
  const httpAgents: AgentType[] = [
    "antigravity",
    "cline",
    "cline-cli",
    "claude-code",
    "codex",
    "cursor",
    "fx",
    "gemini-cli",
    "github-copilot-cli",
    "goose",
    "grok-build",
    "kilo-code",
    "kimi-code",
    "kiro-cli",
    "mcporter",
    "opencode",
    "vscode",
    "windsurf",
    "zed",
  ];

  for (const type of httpAgents) {
    assert.strictEqual(
      isTransportSupported(type, "http"),
      true,
      `${type} should support http`,
    );
  }
});

test("isTransportSupported - most agents support sse", () => {
  const sseAgents: AgentType[] = [
    "antigravity",
    "cline",
    "cline-cli",
    "claude-code",
    "codex",
    "cursor",
    "fx",
    "gemini-cli",
    "github-copilot-cli",
    "goose",
    "grok-build",
    "kilo-code",
    "kimi-code",
    "kiro-cli",
    "mcporter",
    "opencode",
    "vscode",
    "windsurf",
    "zed",
  ];

  for (const type of sseAgents) {
    assert.strictEqual(
      isTransportSupported(type, "sse"),
      true,
      `${type} should support sse`,
    );
  }
});

test("antigravity supports stdio, http, and sse", () => {
  assert.strictEqual(
    isTransportSupported("antigravity", "stdio"),
    true,
    "antigravity should support stdio",
  );
  assert.strictEqual(
    isTransportSupported("antigravity", "http"),
    true,
    "antigravity should support http",
  );
  assert.strictEqual(
    isTransportSupported("antigravity", "sse"),
    true,
    "antigravity should support sse",
  );
});

test("antigravity has no unsupportedTransportMessage", () => {
  const msg = agents.antigravity.unsupportedTransportMessage;
  assert.strictEqual(
    msg,
    undefined,
    "antigravity should not have an unsupportedTransportMessage",
  );
});

test("isTransportSupported - claude-desktop only supports stdio", () => {
  assert.strictEqual(
    isTransportSupported("claude-desktop", "stdio"),
    true,
    "claude-desktop should support stdio",
  );
  assert.strictEqual(
    isTransportSupported("claude-desktop", "http"),
    false,
    "claude-desktop should not support http",
  );
  assert.strictEqual(
    isTransportSupported("claude-desktop", "sse"),
    false,
    "claude-desktop should not support sse",
  );
});

test("claude-desktop has unsupportedTransportMessage", () => {
  const msg = agents["claude-desktop"].unsupportedTransportMessage;
  assert.ok(msg, "claude-desktop should have an unsupportedTransportMessage");
  assert.ok(
    msg.includes("Settings"),
    "message should mention the Settings UI path",
  );
});

// ============================================
// Agent Config Path Tests
// ============================================

test("Project-capable agents have localConfigPath", () => {
  const projectAgents = getProjectCapableAgents();
  for (const type of projectAgents) {
    assert.ok(
      agents[type].localConfigPath,
      `${type} should have localConfigPath`,
    );
  }
});

test("Global-only agents do not have localConfigPath", () => {
  const globalAgents = getGlobalOnlyAgents();
  for (const type of globalAgents) {
    assert.strictEqual(
      agents[type].localConfigPath,
      undefined,
      `${type} should not have localConfigPath`,
    );
  }
});

test("Project-capable agents have non-empty projectDetectPaths", () => {
  const projectAgents = getProjectCapableAgents();
  for (const type of projectAgents) {
    assert.ok(
      agents[type].projectDetectPaths.length > 0,
      `${type} should have projectDetectPaths`,
    );
  }
});

test("Global-only agents have empty projectDetectPaths", () => {
  const globalAgents = getGlobalOnlyAgents();
  for (const type of globalAgents) {
    assert.strictEqual(
      agents[type].projectDetectPaths.length,
      0,
      `${type} should have empty projectDetectPaths`,
    );
  }
});

// ============================================
// Agent Selection Ordering Tests
// ============================================

test("buildAgentSelectionChoices orders detected, last selected, then remaining", () => {
  const availableAgents: AgentType[] = ["cursor", "vscode", "opencode", "zed"];
  const detectedAgents: AgentType[] = ["cursor", "vscode"];
  const lastSelected = ["zed", "cursor"];
  const routing = new Map<AgentType, "local" | "global">([
    ["cursor", "local"],
    ["vscode", "local"],
  ]);

  const result = buildAgentSelectionChoices({
    availableAgents,
    detectedAgents,
    agentRouting: routing,
    lastSelected,
  });

  const orderedValues = result.choices.map((choice) => choice.value);
  assert.deepStrictEqual(orderedValues, [
    "cursor",
    "vscode",
    "zed",
    "opencode",
  ]);

  assert.deepStrictEqual(result.initialValues, ["cursor", "vscode"]);
  const zedChoice = result.choices.find((choice) => choice.value === "zed");
  assert.ok(zedChoice);
  assert.ok(zedChoice.hint.includes("selected last time"));
});

// Cleanup and summary
cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
