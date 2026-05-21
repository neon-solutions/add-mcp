#!/usr/bin/env tsx

import assert from "node:assert";
import {
  buildPackageArgumentsArgvNonInteractive,
  definitionsFromPackage,
  isNamedArg,
  normalizeNamedFlag,
} from "../src/package-arguments.js";

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

test("normalizeNamedFlag keeps leading dashes", () => {
  assert.strictEqual(normalizeNamedFlag("--port"), "--port");
});

test("normalizeNamedFlag prefixes bare names", () => {
  assert.strictEqual(
    normalizeNamedFlag("allowed-directories"),
    "--allowed-directories",
  );
});

test("isNamedArg respects explicit positional type", () => {
  assert.strictEqual(isNamedArg({ type: "positional", valueHint: "x" }), false);
});

test("isNamedArg respects explicit named type", () => {
  assert.strictEqual(isNamedArg({ type: "named", name: "--x" }), true);
});

test("isNamedArg infers named when type empty and name set", () => {
  assert.strictEqual(isNamedArg({ type: "", name: "--mode" }), true);
});

test("isNamedArg infers positional when type empty and only valueHint", () => {
  assert.strictEqual(isNamedArg({ type: "", valueHint: "dir" }), false);
});

test("definitionsFromPackage reads packageArguments only", () => {
  assert.deepStrictEqual(
    definitionsFromPackage({
      packageArguments: [{ type: "positional", value: "mcp" }],
    }),
    [{ type: "positional", value: "mcp" }],
  );
});

test("buildPackageArgumentsArgvNonInteractive: named constant emits flag and value", () => {
  const argv = buildPackageArgumentsArgvNonInteractive([
    { type: "named", name: "--mode", value: "read-only" },
  ]);
  assert.deepStrictEqual(argv, ["--mode", "read-only"]);
});

test("buildPackageArgumentsArgvNonInteractive: named required empty uses placeholder", () => {
  const argv = buildPackageArgumentsArgvNonInteractive([
    { type: "named", name: "--token", isRequired: true },
  ]);
  assert.deepStrictEqual(argv, ["--token", "<your-variable-value-here>"]);
});

test("buildPackageArgumentsArgvNonInteractive: optional named omitted when unset", () => {
  const argv = buildPackageArgumentsArgvNonInteractive([
    { type: "named", name: "--verbose", isRequired: false },
  ]);
  assert.deepStrictEqual(argv, []);
});

test("buildPackageArgumentsArgvNonInteractive: positional literal", () => {
  const argv = buildPackageArgumentsArgvNonInteractive([
    { type: "positional", value: "mcp" },
    { type: "positional", value: "start" },
  ]);
  assert.deepStrictEqual(argv, ["mcp", "start"]);
});

test("buildPackageArgumentsArgvNonInteractive: templates substituted in -y mode", () => {
  const argv = buildPackageArgumentsArgvNonInteractive([
    {
      type: "named",
      name: "--uri",
      value: "postgresql://${HOST}:${PORT}/db",
      isRequired: true,
    },
  ]);
  assert.deepStrictEqual(argv, [
    "--uri",
    "postgresql://<your-variable-value-here>:<your-variable-value-here>/db",
  ]);
});

testChain.then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
