#!/usr/bin/env tsx

import assert from "node:assert";
import {
  findTemplateVars,
  resolveTemplates,
  resolveRecordTemplates,
  resolveArrayTemplates,
  hasTemplateVars,
  substituteTemplatePlaceholders,
} from "../src/template.js";

let passed = 0;
let failed = 0;
let testChain = Promise.resolve();

function test(name: string, fn: () => void | Promise<void>) {
  testChain = testChain
    .then(fn)
    .then(() => {
      console.log(`✓ ${name}`);
      passed++;
    })
    .catch((err: unknown) => {
      console.log(`✗ ${name}`);
      console.error(`  ${(err as Error).message}`);
      failed++;
    });
}

// findTemplateVars

test("findTemplateVars returns empty array for plain string", () => {
  assert.deepStrictEqual(findTemplateVars("hello world"), []);
});

test("findTemplateVars returns empty array for empty string", () => {
  assert.deepStrictEqual(findTemplateVars(""), []);
});

test("findTemplateVars extracts single variable", () => {
  assert.deepStrictEqual(findTemplateVars("${API_KEY}"), ["API_KEY"]);
});

test("findTemplateVars extracts variable embedded in text", () => {
  assert.deepStrictEqual(findTemplateVars("Bearer ${TOKEN}"), ["TOKEN"]);
});

test("findTemplateVars extracts multiple variables", () => {
  assert.deepStrictEqual(findTemplateVars("${HOST}:${PORT}/db"), [
    "HOST",
    "PORT",
  ]);
});

test("findTemplateVars ignores incomplete syntax", () => {
  assert.deepStrictEqual(findTemplateVars("${UNCLOSED"), []);
  assert.deepStrictEqual(findTemplateVars("$BARE_VAR"), []);
  assert.deepStrictEqual(findTemplateVars("{NOT_TEMPLATE}"), []);
});

test("findTemplateVars is reentrant across calls", () => {
  assert.deepStrictEqual(findTemplateVars("${A}"), ["A"]);
  assert.deepStrictEqual(findTemplateVars("${B}"), ["B"]);
  assert.deepStrictEqual(findTemplateVars("${C}${D}"), ["C", "D"]);
});

test("substituteTemplatePlaceholders replaces each template", () => {
  assert.strictEqual(
    substituteTemplatePlaceholders("a=${X}-${Y}", "<ph>"),
    "a=<ph>-<ph>",
  );
});

// resolveTemplates

test("resolveTemplates returns value unchanged when no templates", async () => {
  const result = await resolveTemplates("plain-value", async () => "unused");
  assert.strictEqual(result.cancelled, false);
  assert.strictEqual(result.resolved, "plain-value");
});

test("resolveTemplates substitutes single template", async () => {
  const result = await resolveTemplates("${API_KEY}", async (name) => {
    assert.strictEqual(name, "API_KEY");
    return "sk-123";
  });
  assert.strictEqual(result.cancelled, false);
  assert.strictEqual(result.resolved, "sk-123");
});

test("resolveTemplates substitutes template embedded in text", async () => {
  const result = await resolveTemplates(
    "Bearer ${TOKEN}",
    async () => "my-token",
  );
  assert.strictEqual(result.cancelled, false);
  assert.strictEqual(result.resolved, "Bearer my-token");
});

test("resolveTemplates substitutes multiple templates", async () => {
  const answers = ["localhost", "5432"];
  let callIndex = 0;
  const result = await resolveTemplates("${HOST}:${PORT}/db", async (name) => {
    if (callIndex === 0) assert.strictEqual(name, "HOST");
    if (callIndex === 1) assert.strictEqual(name, "PORT");
    return answers[callIndex++]!;
  });
  assert.strictEqual(result.cancelled, false);
  assert.strictEqual(result.resolved, "localhost:5432/db");
});

test("resolveTemplates returns cancelled when prompt is cancelled", async () => {
  const result = await resolveTemplates("${KEY}", async () => Symbol("cancel"));
  assert.strictEqual(result.cancelled, true);
});

test("resolveTemplates substitutes empty string for empty input", async () => {
  const result = await resolveTemplates("prefix-${VAR}-suffix", async () => "");
  assert.strictEqual(result.cancelled, false);
  assert.strictEqual(result.resolved, "prefix--suffix");
});

test("resolveTemplates stops prompting after cancel on first of multiple", async () => {
  let promptCount = 0;
  const result = await resolveTemplates("${A}-${B}", async () => {
    promptCount++;
    return Symbol("cancel");
  });
  assert.strictEqual(result.cancelled, true);
  assert.strictEqual(promptCount, 1);
});

// hasTemplateVars

test("hasTemplateVars returns false for plain record values", () => {
  assert.strictEqual(hasTemplateVars({ KEY: "value" }), false);
});

test("hasTemplateVars returns true when record has template", () => {
  assert.strictEqual(hasTemplateVars({ KEY: "${VAR}" }), true);
});

test("hasTemplateVars returns false for plain array", () => {
  assert.strictEqual(hasTemplateVars(["--read-only", "value"]), false);
});

test("hasTemplateVars returns true when array has template", () => {
  assert.strictEqual(hasTemplateVars(["--db", "${DB_URL}"]), true);
});

test("hasTemplateVars returns false for empty inputs", () => {
  assert.strictEqual(hasTemplateVars({}), false);
  assert.strictEqual(hasTemplateVars([]), false);
});

// resolveRecordTemplates

test("resolveRecordTemplates resolves templates in record values", async () => {
  const result = await resolveRecordTemplates(
    { API_KEY: "${TOKEN}", DB: "literal" },
    async (name) => {
      assert.strictEqual(name, "TOKEN");
      return "resolved-token";
    },
  );
  assert.strictEqual(result.cancelled, false);
  assert.deepStrictEqual(result.resolved, {
    API_KEY: "resolved-token",
    DB: "literal",
  });
});

test("resolveRecordTemplates returns cancelled on abort", async () => {
  const result = await resolveRecordTemplates(
    { A: "${X}", B: "${Y}" },
    async () => Symbol("cancel"),
  );
  assert.strictEqual(result.cancelled, true);
});

test("resolveRecordTemplates passes through record with no templates", async () => {
  const result = await resolveRecordTemplates(
    { KEY: "plain" },
    async () => "unused",
  );
  assert.strictEqual(result.cancelled, false);
  assert.deepStrictEqual(result.resolved, { KEY: "plain" });
});

// resolveArrayTemplates

test("resolveArrayTemplates resolves templates in array values", async () => {
  const result = await resolveArrayTemplates(
    ["${CONN}", "--read-only"],
    async (name) => {
      assert.strictEqual(name, "CONN");
      return "postgres://localhost/db";
    },
  );
  assert.strictEqual(result.cancelled, false);
  assert.deepStrictEqual(result.resolved, [
    "postgres://localhost/db",
    "--read-only",
  ]);
});

test("resolveArrayTemplates returns cancelled on abort", async () => {
  const result = await resolveArrayTemplates(["${A}", "${B}"], async () =>
    Symbol("cancel"),
  );
  assert.strictEqual(result.cancelled, true);
});

test("resolveArrayTemplates passes through array with no templates", async () => {
  const result = await resolveArrayTemplates(
    ["--flag", "value"],
    async () => "unused",
  );
  assert.strictEqual(result.cancelled, false);
  assert.deepStrictEqual(result.resolved, ["--flag", "value"]);
});

testChain.then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
