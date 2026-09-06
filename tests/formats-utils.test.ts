#!/usr/bin/env tsx

/**
 * Unit tests for formats utils
 *
 * Run with: npx tsx tests/formats-utils.test.ts
 */

import assert from "node:assert";
import {
  deepMerge,
  dropReplacedServers,
  getNestedValue,
  ROOT_CONFIG_KEY,
} from "../src/formats/index.js";

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

test("deepMerge merges nested objects", () => {
  const target = {
    a: { b: 1 },
    c: 2,
  };
  const source = {
    a: { d: 3 },
  };

  const result = deepMerge(target, source);

  assert.deepStrictEqual(result, {
    a: { b: 1, d: 3 },
    c: 2,
  });
});

test("deepMerge overrides primitives and arrays", () => {
  const target = {
    a: 1,
    b: [1, 2],
    c: { d: 1 },
  };
  const source = {
    a: 2,
    b: [3],
    c: { d: 2 },
  };

  const result = deepMerge(target, source);

  assert.deepStrictEqual(result, {
    a: 2,
    b: [3],
    c: { d: 2 },
  });
});

test("getNestedValue returns nested value", () => {
  const obj = {
    a: { b: { c: 1 } },
  };

  assert.strictEqual(getNestedValue(obj, "a.b.c"), 1);
});

test("getNestedValue returns undefined when missing", () => {
  const obj = {
    a: { b: { c: 1 } },
  };

  assert.strictEqual(getNestedValue(obj, "a.b.d"), undefined);
});

test("getNestedValue returns undefined when path hits non-object", () => {
  const obj = {
    a: 1,
  };

  assert.strictEqual(getNestedValue(obj, "a.b"), undefined);
});

test("dropReplacedServers removes incoming server names so merge replaces them", () => {
  const existing = {
    mcp_servers: {
      firecrawl: {
        command: "npx",
        args: ["-y", "firecrawl-mcp"],
        env: { FIRECRAWL_API_KEY: "fc-test" },
      },
      other: { url: "https://other.example.com/mcp" },
    },
  };
  const incoming = {
    mcp_servers: {
      firecrawl: { type: "http", url: "https://mcp.firecrawl.dev/v2/mcp" },
    },
  };

  dropReplacedServers(existing, incoming, "mcp_servers");
  const merged = deepMerge(existing, incoming);

  assert.deepStrictEqual(
    (merged.mcp_servers as Record<string, unknown>).firecrawl,
    { type: "http", url: "https://mcp.firecrawl.dev/v2/mcp" },
  );
  assert.deepStrictEqual(
    (merged.mcp_servers as Record<string, unknown>).other,
    { url: "https://other.example.com/mcp" },
  );
});

test("dropReplacedServers walks dotted config keys", () => {
  const existing = {
    a: { servers: { example: { command: "npx", args: ["-y", "example"] } } },
  };
  const incoming = {
    a: { servers: { example: { url: "https://example.com/mcp" } } },
  };

  dropReplacedServers(existing, incoming, "a.servers");
  const merged = deepMerge(existing, incoming);

  assert.deepStrictEqual(
    ((merged.a as Record<string, unknown>).servers as Record<string, unknown>)
      .example,
    { url: "https://example.com/mcp" },
  );
});

test("dropReplacedServers is a no-op when the config key is missing", () => {
  const existing = { unrelated: true };
  const incoming = {
    mcp_servers: { example: { url: "https://example.com/mcp" } },
  };

  dropReplacedServers(existing, incoming, "mcp_servers");

  assert.deepStrictEqual(existing, { unrelated: true });
});

test("getNestedValue with ROOT_CONFIG_KEY returns the object", () => {
  const obj = { ghc: { url: "https://mcp.example.com/api" } };
  assert.deepStrictEqual(getNestedValue(obj, ROOT_CONFIG_KEY), obj);
});

test("dropReplacedServers at ROOT_CONFIG_KEY deletes the named server", () => {
  const existing = {
    ghc: { url: "https://old.example.com" },
    keep: { url: "https://keep.example.com" },
  };
  const incoming = { ghc: { url: "https://new.example.com" } };

  dropReplacedServers(existing, incoming, ROOT_CONFIG_KEY);

  assert.deepStrictEqual(existing, {
    keep: { url: "https://keep.example.com" },
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
