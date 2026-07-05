#!/usr/bin/env tsx

/**
 * Unit tests for config.ts - persistence for user preferences and registry config.
 *
 * Run with: npx tsx tests/config.test.ts
 */

import assert from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  getFindRegistries,
  getLastSelectedAgents,
  getConfigPath,
  readConfig,
  saveFindRegistries,
  saveSelectedAgents,
} from "../src/config.js";

let passed = 0;
let failed = 0;
let tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`\u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`\u2717 ${name}`);
    console.error(`  ${(err as Error).message}`);
    failed++;
  }
}

function setupTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-config-test-"));
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  process.env.XDG_CONFIG_HOME = join(dir, ".config");
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
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }
  if (originalUserProfile !== undefined) {
    process.env.USERPROFILE = originalUserProfile;
  } else {
    delete process.env.USERPROFILE;
  }
  if (originalXdgConfigHome !== undefined) {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  } else {
    delete process.env.XDG_CONFIG_HOME;
  }
}

async function run() {
  await test("readConfig returns empty config for missing file", async () => {
    setupTempHome();
    const config = await readConfig();
    assert.strictEqual(config.version, 1);
    assert.strictEqual(config.lastSelectedAgents, undefined);
  });

  await test("saveSelectedAgents persists last selection", async () => {
    setupTempHome();
    await saveSelectedAgents(["cursor", "vscode"]);
    const stored = await getLastSelectedAgents();
    assert.deepStrictEqual(stored, ["cursor", "vscode"]);
  });

  await test("readConfig resets when version is missing", async () => {
    setupTempHome();
    const configPath = getConfigPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ lastSelectedAgents: ["zed"] }));
    const config = await readConfig();
    assert.strictEqual(config.version, 1);
    assert.strictEqual(config.lastSelectedAgents, undefined);
  });

  await test("saveFindRegistries persists registry selections", async () => {
    setupTempHome();
    await saveFindRegistries([
      {
        url: "https://mcp.agent-tooling.dev/api/v1/servers",
        label: "integrations.sh MCP registry",
      },
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official Anthropic registry",
      },
    ]);
    const registries = await getFindRegistries();
    assert.deepStrictEqual(registries, [
      {
        url: "https://mcp.agent-tooling.dev/api/v1/servers",
        label: "integrations.sh MCP registry",
      },
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official Anthropic registry",
      },
    ]);
  });

  await test("config is written to ~/.config/add-mcp/config.json", async () => {
    const home = setupTempHome();
    await saveSelectedAgents(["cursor"]);
    const expectedPath = join(home, ".config", "add-mcp", "config.json");
    assert.strictEqual(existsSync(expectedPath), true);
  });

  await test("migrates from legacy ~/.agents/.mcp-lock.json", async () => {
    const home = setupTempHome();

    const legacyPath = join(home, ".agents", ".mcp-lock.json");
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        version: 1,
        lastSelectedAgents: ["cursor", "claude-code"],
        findRegistries: [
          {
            url: "https://mcp.agent-tooling.dev/api/v1/servers",
            label: "integrations.sh MCP registry",
          },
        ],
      }),
    );

    const config = await readConfig();
    assert.deepStrictEqual(config.lastSelectedAgents, [
      "cursor",
      "claude-code",
    ]);
    assert.strictEqual(config.findRegistries?.length, 1);

    const newPath = join(home, ".config", "add-mcp", "config.json");
    assert.strictEqual(
      existsSync(newPath),
      true,
      "new config should exist after migration",
    );
    assert.strictEqual(
      existsSync(legacyPath),
      false,
      "legacy file should be cleaned up",
    );
  });

  await test("prefers new config over legacy when both exist", async () => {
    const home = setupTempHome();

    const legacyPath = join(home, ".agents", ".mcp-lock.json");
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        version: 1,
        lastSelectedAgents: ["legacy-agent"],
      }),
    );

    const newPath = join(home, ".config", "add-mcp", "config.json");
    mkdirSync(dirname(newPath), { recursive: true });
    writeFileSync(
      newPath,
      JSON.stringify({
        version: 1,
        lastSelectedAgents: ["new-agent"],
      }),
    );

    const config = await readConfig();
    assert.deepStrictEqual(config.lastSelectedAgents, ["new-agent"]);
  });

  await test("respects XDG_CONFIG_HOME", async () => {
    const home = setupTempHome();
    const customConfig = join(home, "custom-config");
    process.env.XDG_CONFIG_HOME = customConfig;

    await saveSelectedAgents(["codex"]);

    const expectedPath = join(customConfig, "add-mcp", "config.json");
    assert.strictEqual(existsSync(expectedPath), true);

    const saved = JSON.parse(readFileSync(expectedPath, "utf-8")) as {
      lastSelectedAgents?: string[];
    };
    assert.deepStrictEqual(saved.lastSelectedAgents, ["codex"]);
  });

  cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

await run();
