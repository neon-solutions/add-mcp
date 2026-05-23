#!/usr/bin/env tsx

/**
 * Unit tests for source-parser.ts
 *
 * Run with: npx tsx tests/source-parser.test.ts
 */

import assert from "node:assert";
import {
  parseSource,
  isRemoteSource,
  isLocalSource,
} from "../src/source-parser.js";

let passed = 0;
let failed = 0;

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

// Remote URL tests
test("Remote URL - HTTPS with mcp subdomain", () => {
  const result = parseSource("https://mcp.example.com/api");
  assert.strictEqual(result.type, "remote");
  assert.strictEqual(result.value, "https://mcp.example.com/api");
  // Extracts brand name, stripping "mcp" prefix and TLD
  assert.strictEqual(result.inferredName, "example");
});

test("Remote URL - HTTP localhost", () => {
  const result = parseSource("http://localhost:3000/mcp");
  assert.strictEqual(result.type, "remote");
  assert.strictEqual(result.value, "http://localhost:3000/mcp");
  assert.strictEqual(result.inferredName, "localhost");
});

test("Remote URL - with api subdomain", () => {
  const result = parseSource("https://api.company.com/mcp/v1");
  assert.strictEqual(result.type, "remote");
  // Strips "api" prefix and ".com" TLD
  assert.strictEqual(result.inferredName, "company");
});

test("Remote URL - mcp.neon.tech extracts neon", () => {
  const result = parseSource("https://mcp.neon.tech/mcp");
  assert.strictEqual(result.type, "remote");
  assert.strictEqual(result.inferredName, "neon");
});

test("Remote URL - workos.com extracts workos", () => {
  const result = parseSource("https://workos.com/mcp");
  assert.strictEqual(result.type, "remote");
  assert.strictEqual(result.inferredName, "workos");
});

test("Remote URL - mcp.sentry.io extracts sentry", () => {
  const result = parseSource("https://mcp.sentry.io/api");
  assert.strictEqual(result.type, "remote");
  assert.strictEqual(result.inferredName, "sentry");
});

// Package name tests
test("Package name - simple", () => {
  const result = parseSource("mcp-server-postgres");
  assert.strictEqual(result.type, "package");
  assert.strictEqual(result.value, "mcp-server-postgres");
  assert.strictEqual(result.inferredName, "postgres");
});

test("Package name - scoped", () => {
  const result = parseSource("@modelcontextprotocol/server-postgres");
  assert.strictEqual(result.type, "package");
  assert.strictEqual(result.value, "@modelcontextprotocol/server-postgres");
  assert.strictEqual(result.inferredName, "postgres");
});

test("Package name - with version", () => {
  const result = parseSource("mcp-server-github@1.0.0");
  assert.strictEqual(result.type, "package");
  assert.strictEqual(result.value, "mcp-server-github@1.0.0");
  assert.strictEqual(result.inferredName, "github");
});

test("Package name - scoped with version", () => {
  const result = parseSource("@org/mcp-server@2.0.0");
  assert.strictEqual(result.type, "package");
  assert.strictEqual(result.value, "@org/mcp-server@2.0.0");
});

// Command tests
test("Command - npx with package", () => {
  const result = parseSource("npx -y @modelcontextprotocol/server-postgres");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(
    result.value,
    "npx -y @modelcontextprotocol/server-postgres",
  );
  assert.strictEqual(result.inferredName, "postgres");
});

test("Command - node with script", () => {
  const result = parseSource("node /path/to/server.js --port 3000");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "node /path/to/server.js --port 3000");
});

test("Command - python", () => {
  const result = parseSource("python -m mcp_server");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "python -m mcp_server");
});

test("Command - complex with args", () => {
  const result = parseSource("npx -y mcp-server-github --token abc123");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.inferredName, "github");
});

// Absolute-path command tests (regression: https://github.com/neon-solutions/add-mcp/issues/29)
test("Command - absolute path without spaces", () => {
  const result = parseSource("/usr/local/bin/my-mcp-server");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "/usr/local/bin/my-mcp-server");
  assert.strictEqual(result.inferredName, "my-mcp-server");
});

test("Command - absolute path with spaces preserved as single value", () => {
  const result = parseSource(
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer",
  );
  assert.strictEqual(result.type, "command");
  // The whole path (including spaces) is preserved as the command value.
  assert.strictEqual(
    result.value,
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer",
  );
  // Inferred name comes from the binary basename.
  assert.strictEqual(result.inferredName, "HopperMCPServer");
});

test("Command - home-relative path with spaces", () => {
  const result = parseSource("~/My Tools/server-bin");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "~/My Tools/server-bin");
  assert.strictEqual(result.inferredName, "bin");
});

test("Command - dot-relative path", () => {
  const result = parseSource("./bin/my-server");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "./bin/my-server");
  assert.strictEqual(result.inferredName, "my-server");
});

test("Command - parent-relative path with spaces", () => {
  const result = parseSource("../local bin/my-server.sh");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "../local bin/my-server.sh");
  // Strip extension when inferring name from a binary path.
  assert.strictEqual(result.inferredName, "my-server");
});

test("Command - Windows path with spaces", () => {
  const result = parseSource("C:\\Program Files\\My App\\bin\\server.exe");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(
    result.value,
    "C:\\Program Files\\My App\\bin\\server.exe",
  );
  assert.strictEqual(result.inferredName, "server");
});

test("Command - Windows path with forward slashes", () => {
  const result = parseSource("D:/Tools/My Server/run.cmd");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "D:/Tools/My Server/run.cmd");
  assert.strictEqual(result.inferredName, "run");
});

test("Command - absolute path with trailing slash binary", () => {
  // Even when the path itself includes a space-containing folder name, the
  // entire string remains the command value.
  const result = parseSource("/opt/Some App/HopperMCPServer");
  assert.strictEqual(result.type, "command");
  assert.strictEqual(result.value, "/opt/Some App/HopperMCPServer");
  assert.strictEqual(result.inferredName, "HopperMCPServer");
});

// Helper function tests
test("isRemoteSource - remote URL returns true", () => {
  const parsed = parseSource("https://example.com/mcp");
  assert.strictEqual(isRemoteSource(parsed), true);
});

test("isRemoteSource - package returns false", () => {
  const parsed = parseSource("mcp-server");
  assert.strictEqual(isRemoteSource(parsed), false);
});

test("isLocalSource - package returns true", () => {
  const parsed = parseSource("mcp-server");
  assert.strictEqual(isLocalSource(parsed), true);
});

test("isLocalSource - command returns true", () => {
  const parsed = parseSource("npx mcp-server");
  assert.strictEqual(isLocalSource(parsed), true);
});

test("isLocalSource - remote URL returns false", () => {
  const parsed = parseSource("https://example.com/mcp");
  assert.strictEqual(isLocalSource(parsed), false);
});

// Edge cases
test("Whitespace trimming", () => {
  const result = parseSource("  https://example.com/mcp  ");
  assert.strictEqual(result.type, "remote");
  assert.strictEqual(result.value, "https://example.com/mcp");
});

test("Name inference - server- prefix removed", () => {
  const result = parseSource("server-filesystem");
  assert.strictEqual(result.inferredName, "filesystem");
});

test("Name inference - -mcp suffix removed", () => {
  const result = parseSource("github-mcp");
  assert.strictEqual(result.inferredName, "github");
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
