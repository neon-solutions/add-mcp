#!/usr/bin/env tsx

import assert from "node:assert";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isOpenCodeServerEntry,
  listOpenCodeServers,
  readOpenCodeLayout,
  relocateOpenCodeServer,
  removeOpenCodeServer,
  resolveOpenCodeUpsertKey,
} from "../src/opencode-config.js";

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
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-opencode-config-"));
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

function write(dir: string, contents: string): string {
  const path = join(dir, "opencode.jsonc");
  writeFileSync(path, contents);
  return path;
}

test("isOpenCodeServerEntry: local, remote, url, command array, enablement-only", () => {
  assert.strictEqual(
    isOpenCodeServerEntry({ type: "local", command: ["npx", "-y", "pkg"] }),
    true,
  );
  assert.strictEqual(
    isOpenCodeServerEntry({ type: "remote", url: "https://example.com/mcp" }),
    true,
  );
  assert.strictEqual(
    isOpenCodeServerEntry({ url: "https://example.com/mcp" }),
    true,
  );
  assert.strictEqual(isOpenCodeServerEntry({ command: "node" }), true);
  assert.strictEqual(
    isOpenCodeServerEntry({ command: ["node", "srv.js"] }),
    true,
  );
  assert.strictEqual(isOpenCodeServerEntry({ enabled: false }), true);
  assert.strictEqual(isOpenCodeServerEntry({ disabled: true }), true);
  assert.strictEqual(isOpenCodeServerEntry({}), false);
  assert.strictEqual(isOpenCodeServerEntry({ startup: 4000 }), false);
  assert.strictEqual(isOpenCodeServerEntry("remote"), false);
});

test("missing file classifies empty and upserts to legacy", () => {
  const path = join(createTempDir(), "opencode.jsonc");
  const layout = readOpenCodeLayout(path);
  assert.strictEqual(layout.nativeMap, null);
  assert.deepStrictEqual(layout.legacy, {});
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "example"), "mcp");
  assert.deepStrictEqual(listOpenCodeServers(path), []);
});

test("comment-only and empty object upsert to legacy", () => {
  const comments = write(createTempDir(), "// MCP configuration\n");
  assert.strictEqual(resolveOpenCodeUpsertKey(comments, "example"), "mcp");
  const empty = write(createTempDir(), "{}");
  assert.strictEqual(resolveOpenCodeUpsertKey(empty, "example"), "mcp");
});

test("empty native map upserts to mcp.servers", () => {
  const path = write(createTempDir(), JSON.stringify({ mcp: { servers: {} } }));
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "example"), "mcp.servers");
  assert.deepStrictEqual(listOpenCodeServers(path), []);
});

test("native map plus timeout metadata is not mixed", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        timeout: { startup: 4000, request: 30_000 },
        servers: {
          native: { type: "remote", url: "https://native.example.com/mcp" },
        },
      },
    }),
  );
  const layout = readOpenCodeLayout(path);
  assert.ok(layout.nativeMap);
  assert.deepStrictEqual(Object.keys(layout.legacy), []);
  assert.strictEqual(layout.timeoutIsMetadata, true);
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "new"), "mcp.servers");
  const listed = listOpenCodeServers(path);
  assert.deepStrictEqual(
    listed.map((s) => s.serverName),
    ["native"],
  );
});

test("legacy-only upserts under mcp", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        keep: { type: "remote", url: "https://keep.example.com/mcp" },
      },
    }),
  );
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "keep"), "mcp");
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "new"), "mcp");
});

test("mixed file updates each name in its current map and adds ordinary names as legacy", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        legacy: { type: "remote", url: "https://legacy.example.com/mcp" },
        servers: {
          native: { type: "remote", url: "https://native.example.com/mcp" },
        },
      },
    }),
  );
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "native"), "mcp.servers");
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "legacy"), "mcp");
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "new"), "mcp");
});

test("duplicate name lists native only and upserts native", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        dup: {
          type: "remote",
          url: "https://legacy-dup.example.com/mcp",
          headers: { Authorization: "legacy" },
        },
        servers: {
          dup: {
            type: "remote",
            url: "https://native-dup.example.com/mcp",
            headers: { Authorization: "native" },
          },
        },
      },
    }),
  );
  const listed = listOpenCodeServers(path);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0]?.serverName, "dup");
  assert.strictEqual(listed[0]?.configKey, "mcp.servers");
  assert.strictEqual(
    listed[0]?.config.url,
    "https://native-dup.example.com/mcp",
  );
  assert.deepStrictEqual(listed[0]?.config.headers, {
    Authorization: "native",
  });
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "dup"), "mcp.servers");
});

test("key order does not change listing", () => {
  const nativeFirst = write(
    createTempDir(),
    `{
  "mcp": {
    "servers": {
      "dup": { "type": "remote", "url": "https://native.example.com/mcp" }
    },
    "dup": { "type": "remote", "url": "https://legacy.example.com/mcp" }
  }
}`,
  );
  const legacyFirst = write(
    createTempDir(),
    `{
  "mcp": {
    "dup": { "type": "remote", "url": "https://legacy.example.com/mcp" },
    "servers": {
      "dup": { "type": "remote", "url": "https://native.example.com/mcp" }
    }
  }
}`,
  );
  for (const path of [nativeFirst, legacyFirst]) {
    const listed = listOpenCodeServers(path);
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0]?.config.url, "https://native.example.com/mcp");
    assert.strictEqual(listed[0]?.configKey, "mcp.servers");
  }
});

test("legacy server named servers is not treated as a native map", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        servers: {
          type: "remote",
          url: "https://named-servers.example.com/mcp",
        },
        other: { type: "remote", url: "https://other.example.com/mcp" },
      },
    }),
  );
  const layout = readOpenCodeLayout(path);
  assert.strictEqual(layout.nativeMap, null);
  const names = listOpenCodeServers(path)
    .map((s) => s.serverName)
    .sort();
  assert.deepStrictEqual(names, ["other", "servers"]);
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "servers"), "mcp");
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "new"), "mcp");
});

test("new name timeout refuses when mcp.timeout is metadata and there is no native map", () => {
  const contents = JSON.stringify({
    mcp: {
      timeout: { startup: 4000 },
      keep: { type: "remote", url: "https://keep.example.com/mcp" },
    },
  });
  const path = write(createTempDir(), contents);
  assert.throws(
    () => resolveOpenCodeUpsertKey(path, "timeout"),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes(path) &&
      error.message.includes("mcp.timeout"),
  );
  assert.strictEqual(readFileSync(path, "utf-8"), contents);
});

test("new name timeout writes native when a native map already exists", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        timeout: { startup: 4000 },
        servers: {
          keep: { type: "remote", url: "https://keep.example.com/mcp" },
        },
      },
    }),
  );
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "timeout"), "mcp.servers");
});

test("unrecognized native value hides a same-name legacy server and is not listed", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        foo: { type: "remote", url: "https://legacy.example.com/mcp" },
        servers: { foo: "not-a-server" },
      },
    }),
  );
  assert.deepStrictEqual(listOpenCodeServers(path), []);
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "foo"), "mcp.servers");
});

test("disabled native and legacy servers stay listed", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        off: { enabled: false },
        servers: {
          quiet: {
            type: "remote",
            url: "https://quiet.example.com/mcp",
            disabled: true,
          },
        },
      },
    }),
  );
  const names = listOpenCodeServers(path)
    .map((s) => s.serverName)
    .sort();
  assert.deepStrictEqual(names, ["off", "quiet"]);
});

test("remove deletes both copies and keeps an empty native map", () => {
  const path = write(
    createTempDir(),
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
  assert.strictEqual(removeOpenCodeServer(path, "dup"), true);
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
    theme: string;
    mcp: { timeout: unknown; servers: Record<string, unknown>; dup?: unknown };
  };
  assert.strictEqual(parsed.theme, "dark");
  assert.deepStrictEqual(parsed.mcp.timeout, { startup: 4000 });
  assert.deepStrictEqual(parsed.mcp.servers, {});
  assert.strictEqual(parsed.mcp.dup, undefined);
  assert.deepStrictEqual(listOpenCodeServers(path), []);
  assert.strictEqual(removeOpenCodeServer(path, "dup"), false);
  assert.strictEqual(resolveOpenCodeUpsertKey(path, "next"), "mcp.servers");
});

test("trailing commas and comments are valid OpenCode JSONC", () => {
  const path = write(
    createTempDir(),
    `{
  // keep
  "mcp": {
    "legacy": { "type": "remote", "url": "https://legacy.example.com/mcp", },
  },
}`,
  );
  const listed = listOpenCodeServers(path);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0]?.serverName, "legacy");
});

test("truncated JSONC throws with the path and does not classify a partial object", () => {
  const contents = `{
  "mcp": {
    "keep": { "type": "remote", "url": "https://keep.example.com/mcp"
`;
  const path = write(createTempDir(), contents);
  assert.throws(
    () => listOpenCodeServers(path),
    (error: unknown) =>
      error instanceof Error && error.message === `Invalid JSON in ${path}`,
  );
  assert.strictEqual(readFileSync(path, "utf-8"), contents);
});

test("syntax error inside mcp.servers throws with the path", () => {
  const contents = `{
  "mcp": {
    "servers": {
      "keep": { "type": "remote", "url": https://keep.example.com/mcp }
    }
  }
}`;
  const path = write(createTempDir(), contents);
  assert.throws(
    () => listOpenCodeServers(path),
    (error: unknown) =>
      error instanceof Error && error.message === `Invalid JSON in ${path}`,
  );
  assert.strictEqual(readFileSync(path, "utf-8"), contents);
});

test("mcp.servers as a non-object is rejected", () => {
  const contents = JSON.stringify({ mcp: { servers: ["nope"] } });
  const path = write(createTempDir(), contents);
  assert.throws(
    () => listOpenCodeServers(path),
    (error: unknown) =>
      error instanceof Error &&
      error.message === `${path} mcp.servers must be a JSON object`,
  );
  assert.strictEqual(readFileSync(path, "utf-8"), contents);
});

test("ValueExpected tokens that are not empty files are rejected", () => {
  for (const contents of ["}", "]", ",", "/* unterminated"]) {
    const path = write(createTempDir(), contents);
    assert.throws(
      () => listOpenCodeServers(path),
      (error: unknown) =>
        error instanceof Error && error.message === `Invalid JSON in ${path}`,
    );
    assert.strictEqual(readFileSync(path, "utf-8"), contents);
  }
});

test("V1 servers named toString and constructor stay legacy entries", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        toString: { type: "remote", url: "https://to-string.example.com/mcp" },
        constructor: {
          type: "remote",
          url: "https://constructor.example.com/mcp",
        },
      },
    }),
  );
  const listed = listOpenCodeServers(path);
  const byName = new Map(listed.map((entry) => [entry.serverName, entry]));
  assert.strictEqual(byName.get("toString")?.configKey, "mcp");
  assert.strictEqual(
    byName.get("toString")?.config.url,
    "https://to-string.example.com/mcp",
  );
  assert.strictEqual(byName.get("constructor")?.configKey, "mcp");
  assert.strictEqual(
    byName.get("constructor")?.config.url,
    "https://constructor.example.com/mcp",
  );
});

test("relocate keeps native settings when the name stays in mcp.servers", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        servers: {
          postgres: {
            type: "local",
            command: ["node", "server.js"],
            cwd: "./tools",
            disabled: true,
            timeout: { startup: 45_000 },
          },
        },
      },
    }),
  );
  relocateOpenCodeServer(path, "postgres", "pg");
  const listed = listOpenCodeServers(path);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0]?.serverName, "pg");
  assert.strictEqual(listed[0]?.configKey, "mcp.servers");
  assert.deepStrictEqual(listed[0]?.config, {
    type: "local",
    command: ["node", "server.js"],
    cwd: "./tools",
    disabled: true,
    timeout: { startup: 45_000 },
  });
});

test("relocate carries enabled:false into native disabled:true", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        timeout: { startup: 4000 },
        servers: {},
        "long-timeout": {
          type: "remote",
          url: "https://example.com/mcp",
          enabled: false,
          oauth: { client_id: "configured-client" },
        },
      },
    }),
  );
  relocateOpenCodeServer(path, "long-timeout", "timeout");
  const listed = listOpenCodeServers(path);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0]?.serverName, "timeout");
  assert.strictEqual(listed[0]?.configKey, "mcp.servers");
  assert.ok(listed[0]);
  assert.strictEqual(listed[0].config.disabled, true);
  assert.strictEqual("enabled" in listed[0].config, false);
  assert.deepStrictEqual(listed[0].config.oauth, {
    client_id: "configured-client",
  });
});

test("relocate maps V1 timeout and OAuth into native V2 fields", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        postgres: {
          type: "remote",
          url: "https://mcp.postgres.example.com/mcp",
          enabled: false,
          timeout: 15000,
          oauth: {
            clientId: "configured-client",
            clientSecret: "configured-secret",
            callbackPort: 19876,
            redirectUri: "http://127.0.0.1:19876/callback",
          },
        },
        servers: {
          pg: {
            type: "remote",
            url: "https://mcp.postgres.example.com/mcp",
            disabled: true,
            timeout: { request: 15000 },
            oauth: { client_id: "configured-client" },
          },
        },
      },
    }),
  );
  relocateOpenCodeServer(path, "postgres", "pg");
  const listed = listOpenCodeServers(path);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0]?.serverName, "pg");
  assert.strictEqual(listed[0]?.configKey, "mcp.servers");
  assert.deepStrictEqual(listed[0]?.config, {
    type: "remote",
    url: "https://mcp.postgres.example.com/mcp",
    disabled: true,
    timeout: { request: 15000 },
    oauth: {
      client_id: "configured-client",
      client_secret: "configured-secret",
      callback_port: 19876,
      redirect_uri: "http://127.0.0.1:19876/callback",
    },
  });
});

test("relocate carries native disabled:true into legacy enabled:false", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        keep: { type: "remote", url: "https://keep.example.com/mcp" },
        servers: {
          "long-name": {
            type: "remote",
            url: "https://example.com/mcp",
            disabled: true,
            timeout: { request: 15000, startup: 45_000 },
            oauth: {
              client_id: "configured-client",
              client_secret: "configured-secret",
              callback_port: 19876,
              redirect_uri: "http://127.0.0.1:19876/callback",
            },
          },
        },
      },
    }),
  );
  relocateOpenCodeServer(path, "long-name", "short");
  const listed = listOpenCodeServers(path);
  const moved = listed.find((entry) => entry.serverName === "short");
  assert.ok(moved);
  assert.strictEqual(moved.configKey, "mcp");
  assert.strictEqual(moved.config.enabled, false);
  assert.strictEqual("disabled" in moved.config, false);
  assert.strictEqual(moved.config.timeout, 15000);
  assert.deepStrictEqual(moved.config.oauth, {
    clientId: "configured-client",
    clientSecret: "configured-secret",
    callbackPort: 19876,
    redirectUri: "http://127.0.0.1:19876/callback",
  });
});

test("relocate drops a native startup-only timeout on the legacy map", () => {
  const path = write(
    createTempDir(),
    JSON.stringify({
      mcp: {
        keep: { type: "remote", url: "https://keep.example.com/mcp" },
        servers: {
          "long-name": {
            type: "local",
            command: ["node", "server.js"],
            timeout: { startup: 45_000 },
          },
        },
      },
    }),
  );
  relocateOpenCodeServer(path, "long-name", "short");
  const moved = listOpenCodeServers(path).find(
    (entry) => entry.serverName === "short",
  );
  assert.ok(moved);
  assert.strictEqual(moved.configKey, "mcp");
  assert.strictEqual("timeout" in moved.config, false);
});

cleanup();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
