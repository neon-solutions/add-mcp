#!/usr/bin/env tsx

import assert from "node:assert";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import * as TOML from "@iarna/toml";

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
  const dir = mkdtempSync(join(tmpdir(), "add-mcp-cli-test-"));
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

const testFileDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testFileDir, "..", "..");
const indexPath = join(repoRoot, "src", "index.ts");
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");

function runCli(
  args: string[],
  cwd: string,
  homeDir: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync(tsxBin, [indexPath, ...args], {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      HOME: homeDir,
      XDG_CONFIG_HOME: join(homeDir, ".config"),
      CODEX_HOME: join(homeDir, ".codex"),
      NO_COLOR: "1",
      ...extraEnv,
    },
  });
}

function claudeDesktopConfigPath(homeDir: string): string {
  if (process.platform === "darwin") {
    return join(
      homeDir,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(homeDir, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(homeDir, ".config", "Claude", "claude_desktop_config.json");
}

function windsurfConfigPath(homeDir: string): string {
  return join(homeDir, ".codeium", "windsurf", "mcp_config.json");
}

function antigravityConfigPath(homeDir: string): string {
  return join(homeDir, ".gemini", "config", "mcp_config.json");
}

function seedFindRegistries(homeDir: string) {
  const configPath = join(homeDir, ".config", "add-mcp", "config.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        version: 1,
        findRegistries: [
          {
            url: "https://add-mcp.com/registry/api/v1/servers",
            label: "add-mcp registry",
          },
          {
            url: "https://registry.modelcontextprotocol.io/v0.1/servers",
            label: "Official Anthropic registry",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
}

// Regression: https://github.com/neon-solutions/add-mcp/issues/29
test("E2E CLI: absolute path with spaces is preserved as single command", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const binaryPath =
    "/Applications/Hopper Disassembler.app/Contents/MacOS/HopperMCPServer";

  const result = runCli(
    [binaryPath, "-a", "cursor", "-y", "--name", "Hopper"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const server = servers.Hopper as Record<string, unknown>;

  assert.ok(server, "Hopper server should be configured");
  assert.strictEqual(
    server.command,
    binaryPath,
    "command must keep the full path verbatim (including spaces)",
  );
  assert.deepStrictEqual(
    server.args,
    [],
    "no implicit arg-splitting on spaces in the path",
  );
});

test("E2E CLI: absolute path with spaces accepts repeated --args", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const binaryPath = "/opt/Some App/bin/my-server";

  const result = runCli(
    [
      binaryPath,
      "-a",
      "cursor",
      "-y",
      "--name",
      "Server",
      "--args",
      "--port",
      "--args",
      "3000",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".cursor", "mcp.json");
  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const server = servers.Server as Record<string, unknown>;

  assert.strictEqual(server.command, binaryPath);
  assert.deepStrictEqual(server.args, ["--port", "3000"]);
});

test("E2E CLI: --gitignore adds local config path", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-a", "cursor", "-y", "--gitignore"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const gitignorePath = join(projectDir, ".gitignore");
  assert.strictEqual(existsSync(gitignorePath), true);
  assert.strictEqual(
    readFileSync(gitignorePath, "utf-8"),
    ".cursor/mcp.json\n",
  );
});

test("E2E CLI: --gitignore with --global warns and does not write project .gitignore", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-a", "cursor", "-g", "-y", "--gitignore"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  assert.match(
    combinedOutput,
    /--gitignore is only supported for project-scoped installations; ignoring\./,
  );
  assert.strictEqual(existsSync(join(projectDir, ".gitignore")), false);
  assert.strictEqual(existsSync(join(homeDir, ".cursor", "mcp.json")), true);
});

test("E2E CLI: -y keeps project-capable agents project-scoped by default", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "cursor",
      "-y",
      "--name",
      "project-scope",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  assert.strictEqual(existsSync(join(projectDir, ".cursor", "mcp.json")), true);
  assert.strictEqual(existsSync(join(homeDir, ".cursor", "mcp.json")), false);
});

test("E2E CLI: global-only selections force a shared global scope", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "cursor",
      "-a",
      "claude-desktop",
      "-y",
      "--name",
      "shared-global-scope",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  assert.strictEqual(
    existsSync(join(projectDir, ".cursor", "mcp.json")),
    false,
  );
  assert.strictEqual(existsSync(join(homeDir, ".cursor", "mcp.json")), true);
  assert.strictEqual(existsSync(claudeDesktopConfigPath(homeDir)), true);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Selected agents require global installation/);
  assert.match(output, /Scope:\s*Global/);
});

test("E2E CLI: find -y seeds the default registry and installs", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["find", "neon", "-a", "cursor", "-y"],
    projectDir,
    homeDir,
  );
  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Using add-mcp registry/);

  const addMcpConfigPath = join(homeDir, ".config", "add-mcp", "config.json");
  const addMcpConfig = JSON.parse(readFileSync(addMcpConfigPath, "utf-8")) as {
    findRegistries?: Array<{ url: string; label?: string }>;
  };
  assert.deepStrictEqual(addMcpConfig.findRegistries, [
    {
      url: "https://add-mcp.com/registry/api/v1/servers",
      label: "add-mcp registry",
    },
  ]);

  const cursorConfigPath = join(projectDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(cursorConfigPath), true);
  const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, "utf-8")) as {
    mcpServers?: Record<string, { url?: string }>;
  };
  const neonConfig = Object.values(cursorConfig.mcpServers ?? {}).find(
    (server) => server.url === "https://mcp.neon.tech/mcp",
  );
  assert.ok(
    neonConfig,
    "Neon remote should be installed from default registry",
  );
});

test("E2E CLI: find -y picks best match and installs remote", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  seedFindRegistries(homeDir);

  const result = runCli(
    ["find", "postman", "-a", "cursor", "-y"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcpServers?: Record<string, { url?: string }>;
  };
  const postmanConfig = Object.values(savedConfig.mcpServers ?? {}).find(
    (server) => server.url === "https://mcp.postman.com/minimal",
  );
  assert.ok(postmanConfig);
  assert.strictEqual(postmanConfig?.url, "https://mcp.postman.com/minimal");
});

test("E2E CLI: search alias defaults to HTTP endpoint when both are available", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  seedFindRegistries(homeDir);

  const result = runCli(
    ["search", "linear", "-a", "cursor", "-y"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const savedConfig = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcpServers?: Record<string, { url?: string; type?: string }>;
  };
  const selected = Object.values(savedConfig.mcpServers ?? {}).find(
    (server) => server.url?.includes("linear.app") === true,
  );
  assert.ok(selected, "expected search alias to install a linear endpoint");
  assert.strictEqual(
    selected?.url,
    "https://mcp.linear.app/mcp",
    "expected search alias to prefer HTTP endpoint by default",
  );
});

test("E2E CLI: mcporter default install writes project config", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-a", "mcporter", "-y"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  assert.strictEqual(
    existsSync(join(projectDir, "config", "mcporter.json")),
    true,
  );
});

test("E2E CLI: mcporter global install writes home config", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-a", "mcporter", "-g", "-y"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  assert.strictEqual(
    existsSync(join(homeDir, ".mcporter", "mcporter.json")),
    true,
  );
});

test("E2E CLI: Goose HTTP install with headers", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "goose",
      "-y",
      "--name",
      "example",
      "--header",
      "Authorization: Bearer token",
      "--header",
      "x-read-only: true",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const gooseConfigPath = join(homeDir, ".config", "goose", "config.yaml");
  assert.strictEqual(existsSync(gooseConfigPath), true);

  const saved = yaml.load(readFileSync(gooseConfigPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const extensions = saved.extensions as Record<string, unknown>;
  const server = extensions.example as Record<string, unknown>;

  assert.strictEqual(server.type, "streamable_http");
  assert.strictEqual(server.uri, "https://mcp.example.com/mcp");
  assert.deepStrictEqual(server.headers, {
    Authorization: "Bearer token",
    "x-read-only": "true",
  });
});

test("E2E CLI: fx remote install writes ~/.fx/mcp.json without -g", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "fx",
      "-y",
      "--name",
      "example",
      "--header",
      "X-Workspace: demo",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(homeDir, ".fx", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);
  assert.strictEqual(statSync(join(homeDir, ".fx")).mode & 0o777, 0o700);
  assert.strictEqual(statSync(configPath).mode & 0o777, 0o600);
  assert.strictEqual(existsSync(join(projectDir, ".fx.json")), false);
  assert.strictEqual(existsSync(join(projectDir, "mcp.json")), false);

  const saved = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcp: Record<string, Record<string, unknown>>;
  };
  const server = saved.mcp.example;
  assert.ok(server);
  assert.strictEqual(server.type, "http");
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
  assert.strictEqual(server.enabled, true);
  assert.deepStrictEqual(server.headers, {
    "X-Workspace": "demo",
  });
});

test("E2E CLI: fx writes bearer_token_env", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "fx",
      "-y",
      "--name",
      "example",
      "--bearer-token-env",
      "NEON_API_KEY",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const saved = JSON.parse(
    readFileSync(join(homeDir, ".fx", "mcp.json"), "utf-8"),
  ) as { mcp: Record<string, Record<string, unknown>> };
  const server = saved.mcp.example;
  assert.ok(server);
  assert.strictEqual(server.bearer_token_env, "NEON_API_KEY");
  assert.strictEqual("headers" in server, false);
});

test("E2E CLI: mixed fx then cursor keeps Authorization on Cursor and bearer_token_env on fx", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "fx",
      "-a",
      "cursor",
      "-y",
      "--name",
      "example",
      "--header",
      "Authorization: Bearer token",
      "--bearer-token-env",
      "NEON_API_KEY",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /bearer token env var is not supported by Cursor/);
  assert.match(
    output,
    /Authorization header dropped from the fx config; fx reads the token from NEON_API_KEY/,
  );

  const fxSaved = JSON.parse(
    readFileSync(join(homeDir, ".fx", "mcp.json"), "utf-8"),
  ) as { mcp: Record<string, Record<string, unknown>> };
  const fxServer = fxSaved.mcp.example;
  assert.ok(fxServer);
  assert.strictEqual(fxServer.bearer_token_env, "NEON_API_KEY");
  assert.strictEqual("headers" in fxServer, false);

  const cursorSaved = JSON.parse(
    readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8"),
  ) as { mcpServers: Record<string, Record<string, unknown>> };
  const cursorServer = cursorSaved.mcpServers.example;
  assert.ok(cursorServer);
  assert.deepStrictEqual(cursorServer.headers, {
    Authorization: "Bearer token",
  });
});

test("E2E CLI: --bearer-token-env rejects a value in place of a name", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "fx",
      "-y",
      "--header",
      "Authorization: Bearer token",
      "--bearer-token-env",
      "Bearer sk-live",
    ],
    projectDir,
    homeDir,
  );

  const output = `${result.stdout}\n${result.stderr}`;
  assert.notStrictEqual(result.status, 0);
  assert.match(output, /not a valid name/);
  assert.strictEqual(existsSync(join(homeDir, ".fx")), false);
});

test("E2E CLI: whitespace-only --bearer-token-env fails", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "fx",
      "-y",
      "--bearer-token-env",
      "   ",
    ],
    projectDir,
    homeDir,
  );

  const output = `${result.stdout}\n${result.stderr}`;
  assert.notStrictEqual(result.status, 0);
  assert.match(output, /Invalid --bearer-token-env/);
  assert.strictEqual(existsSync(join(homeDir, ".fx")), false);
});

test("E2E CLI: --bearer-token-env is ignored for stdio installs", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "mcp-server-postgres",
      "-a",
      "fx",
      "-y",
      "--name",
      "postgres",
      "--bearer-token-env",
      "NEON_API_KEY",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /--bearer-token-env is only used for remote URLs/);

  const saved = JSON.parse(
    readFileSync(join(homeDir, ".fx", "mcp.json"), "utf-8"),
  ) as { mcp: Record<string, Record<string, unknown>> };
  const server = saved.mcp.postgres;
  assert.ok(server);
  assert.strictEqual(server.type, "local");
  assert.strictEqual("bearer_token_env" in server, false);
});

test("E2E CLI: fx rejects a literal Authorization header", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "fx",
      "-y",
      "--name",
      "example",
      "--header",
      "Authorization: Bearer token",
    ],
    projectDir,
    homeDir,
  );

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /literal Authorization header/);
  assert.match(output, /--bearer-token-env/);
  assert.strictEqual(existsSync(join(homeDir, ".fx")), false);
});

test("E2E CLI: fx stdio install uses command array and environment", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "mcp-server-postgres",
      "-a",
      "fx",
      "-y",
      "--name",
      "postgres",
      "--env",
      "DATABASE_URL=postgres://localhost/test",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const saved = JSON.parse(
    readFileSync(join(homeDir, ".fx", "mcp.json"), "utf-8"),
  ) as { mcp: Record<string, Record<string, unknown>> };
  const server = saved.mcp.postgres;
  assert.ok(server);
  assert.strictEqual(server.type, "local");
  assert.deepStrictEqual(server.command, ["npx", "-y", "mcp-server-postgres"]);
  assert.deepStrictEqual(server.environment, {
    DATABASE_URL: "postgres://localhost/test",
  });
  assert.strictEqual("args" in server, false);
});

test("E2E CLI: fx list reads the command-array identity", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const install = runCli(
    ["mcp-server-github", "-a", "fx", "-y", "--name", "github"],
    projectDir,
    homeDir,
  );
  if (install.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${install.stdout}\nSTDERR:\n${install.stderr}`,
    );
  }

  const listed = runCli(["list", "-g", "-a", "fx"], projectDir, homeDir);
  if (listed.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${listed.stdout}\nSTDERR:\n${listed.stderr}`,
    );
  }

  const output = `${listed.stdout}\n${listed.stderr}`;
  assert.match(output, /github/);
  assert.match(output, /mcp-server-github/);
});

test("E2E CLI: Goose HTTP install with -h header shorthand", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "goose",
      "-y",
      "--name",
      "example",
      "-h",
      "Authorization: Bearer token",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const gooseConfigPath = join(homeDir, ".config", "goose", "config.yaml");
  const saved = yaml.load(readFileSync(gooseConfigPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const extensions = saved.extensions as Record<string, unknown>;
  const server = extensions.example as Record<string, unknown>;

  assert.deepStrictEqual(server.headers, {
    Authorization: "Bearer token",
  });
});

test("E2E CLI: remote server to claude-desktop errors with custom message", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-a", "claude-desktop", "-y"],
    projectDir,
    homeDir,
  );

  assert.notStrictEqual(result.status, 0, "CLI should exit with non-zero");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /don't support http transport/,
    "should report unsupported transport",
  );
  assert.match(
    output,
    /Settings.*Connectors/,
    "should include the custom unsupportedTransportMessage",
  );
});

test("E2E CLI: --all skips claude-desktop for remote server with custom message", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "--all", "-y"],
    projectDir,
    homeDir,
  );

  assert.strictEqual(result.status, 0, "CLI should succeed");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /Skipping agents.*Claude Desktop/,
    "should warn about skipping Claude Desktop",
  );
  assert.match(
    output,
    /Settings.*Connectors/,
    "should include the custom unsupportedTransportMessage",
  );
});

test("E2E CLI: stdio server to claude-desktop succeeds", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "claude-desktop",
      "-y",
      "--name",
      "filesystem",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = claudeDesktopConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  assert.ok(servers.filesystem, "filesystem server should be configured");

  const server = servers.filesystem as Record<string, unknown>;
  assert.strictEqual(server.command, "npx");
});

test("E2E CLI: remote server to antigravity succeeds with serverUrl config", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "antigravity",
      "-y",
      "--name",
      "remote",
      "--header",
      "Authorization: Bearer token",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = antigravityConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const server = servers.remote as Record<string, unknown>;
  assert.strictEqual(server.serverUrl, "https://mcp.example.com/mcp");
  assert.deepStrictEqual(server.headers, {
    Authorization: "Bearer token",
  });
});

test("E2E CLI: --all includes antigravity for remote server", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "--all", "-y"],
    projectDir,
    homeDir,
  );

  assert.strictEqual(result.status, 0, "CLI should succeed");

  const configPath = antigravityConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const antigravityRemoteServer = Object.values(servers).find((value) => {
    const server = value as Record<string, unknown>;
    return server.serverUrl === "https://mcp.example.com/mcp";
  });
  assert.ok(
    antigravityRemoteServer,
    "remote antigravity server should exist in mcpServers",
  );
});

test("E2E CLI: stdio server to antigravity succeeds", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "antigravity",
      "-y",
      "--name",
      "filesystem",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = antigravityConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  assert.ok(servers.filesystem, "filesystem server should be configured");

  const server = servers.filesystem as Record<string, unknown>;
  assert.strictEqual(server.command, "npx");
});

test("E2E CLI: remote server to windsurf succeeds with serverUrl config", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "windsurf",
      "-y",
      "--name",
      "remote",
      "--header",
      "Authorization: Bearer token",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = windsurfConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const server = servers.remote as Record<string, unknown>;
  assert.strictEqual(server.serverUrl, "https://mcp.example.com/mcp");
  assert.deepStrictEqual(server.headers, {
    Authorization: "Bearer token",
  });
});

test("E2E CLI: --all includes windsurf for remote server", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "--all", "-y"],
    projectDir,
    homeDir,
  );

  assert.strictEqual(result.status, 0, "CLI should succeed");

  const configPath = windsurfConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const windsurfRemoteServer = Object.values(servers).find((value) => {
    const server = value as Record<string, unknown>;
    return server.serverUrl === "https://mcp.example.com/mcp";
  });
  assert.ok(
    windsurfRemoteServer,
    "remote windsurf server should exist in mcpServers",
  );
});

test("E2E CLI: stdio server to windsurf succeeds", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "windsurf",
      "-y",
      "--name",
      "filesystem",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = windsurfConfigPath(homeDir);
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  assert.ok(servers.filesystem, "filesystem server should be configured");

  const server = servers.filesystem as Record<string, unknown>;
  assert.strictEqual(server.command, "npx");
});

test("E2E CLI: windsurf aliases (codeium, cascade) install to windsurf config", () => {
  for (const alias of ["codeium", "cascade"] as const) {
    const projectDir = createTempDir();
    const homeDir = createTempDir();

    const result = runCli(
      ["https://mcp.example.com/mcp", "-a", alias, "-y", "--name", "remote"],
      projectDir,
      homeDir,
    );

    assert.strictEqual(result.status, 0, `${alias} alias should succeed`);

    const configPath = windsurfConfigPath(homeDir);
    assert.strictEqual(existsSync(configPath), true);

    const saved = JSON.parse(readFileSync(configPath, "utf-8"));
    const servers = saved.mcpServers as Record<string, unknown>;
    assert.ok(servers.remote, `${alias} should write remote server config`);
  }
});

test("E2E CLI: local stdio install supports repeated --env", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "cursor",
      "-y",
      "--name",
      "filesystem",
      "--env",
      "API_KEY=secret",
      "--env",
      "NESTED=value=with=equals",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const servers = saved.mcpServers as Record<string, unknown>;
  const server = servers.filesystem as Record<string, unknown>;

  assert.strictEqual(server.command, "npx");
  assert.deepStrictEqual(server.env, {
    API_KEY: "secret",
    NESTED: "value=with=equals",
  });
});

test("E2E CLI: invalid --env format exits with error", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "cursor",
      "-y",
      "--env",
      "INVALID_ENV",
    ],
    projectDir,
    homeDir,
  );

  assert.notStrictEqual(result.status, 0, "CLI should exit with non-zero");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Invalid --env value\(s\)/);
  assert.match(output, /Use 'KEY=VALUE' format\./);
});

test("E2E CLI: --header with empty value hints at shell expansion", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-y", "--header", "Authorization: "],
    projectDir,
    homeDir,
  );

  assert.notStrictEqual(result.status, 0, "CLI should exit with non-zero");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Invalid --header value\(s\)/);
  assert.match(output, /single quotes/);
  assert.match(output, /\$\{VAR\}/);
});

test("E2E CLI: --env with empty value hints at shell expansion", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "cursor",
      "-y",
      "--env",
      "API_KEY=",
    ],
    projectDir,
    homeDir,
  );

  assert.notStrictEqual(result.status, 0, "CLI should exit with non-zero");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Invalid --env value\(s\)/);
  assert.match(output, /single quotes/);
  assert.match(output, /\$\{VAR\}/);
});

test("E2E CLI: --env with no equals does not show shell-expansion hint", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "@modelcontextprotocol/server-filesystem",
      "-a",
      "cursor",
      "-y",
      "--env",
      "no-equals-here",
    ],
    projectDir,
    homeDir,
  );

  assert.notStrictEqual(result.status, 0, "CLI should exit with non-zero");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Invalid --env value\(s\)/);
  assert.doesNotMatch(output, /single quotes/);
});

test("E2E CLI: --header with no colon does not show shell-expansion hint", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["https://mcp.example.com/mcp", "-y", "--header", "no-colon-here"],
    projectDir,
    homeDir,
  );

  assert.notStrictEqual(result.status, 0, "CLI should exit with non-zero");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Invalid --header value\(s\)/);
  assert.doesNotMatch(output, /single quotes/);
});

test("E2E CLI: remote install with --env warns and succeeds", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "cursor",
      "-y",
      "--env",
      "API_KEY=secret",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /--env is only used for local\/package\/command installs, ignoring/,
  );

  const configPath = join(projectDir, ".cursor", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);
});
// ── list command tests ───────────────────────────────────────────────────

test("list: shows servers for detected agents in project", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  // Seed Cursor config with servers
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        neon: { url: "https://mcp.neon.tech/mcp" },
        github: { command: "npx", args: ["-y", "mcp-server-github"] },
      },
    }),
  );

  // Seed Claude Code config
  writeFileSync(
    join(projectDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        context7: { url: "https://mcp.context7.com/mcp" },
      },
    }),
  );

  const result = runCli(["list"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Cursor/);
  assert.match(output, /neon/);
  assert.match(output, /github/);
  assert.match(output, /Claude Code/);
  assert.match(output, /context7/);
});

test("list: shows Gemini CLI httpUrl and honors its precedence", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const geminiDir = join(projectDir, ".gemini");
  mkdirSync(geminiDir, { recursive: true });
  writeFileSync(
    join(geminiDir, "settings.json"),
    JSON.stringify({
      mcpServers: {
        context7: {
          httpUrl: "https://mcp.context7.com/mcp",
          headers: { CONTEXT7_API_KEY: "test" },
        },
        migrating: {
          httpUrl: "https://legacy.example.com/mcp",
          url: "https://new.example.com/mcp",
          type: "http",
        },
      },
    }),
  );

  const result = runCli(["list", "-a", "gemini-cli"], projectDir, homeDir);

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /context7.*https:\/\/mcp\.context7\.com\/mcp/);
  assert.match(output, /migrating.*https:\/\/legacy\.example\.com\/mcp/);
  assert.doesNotMatch(output, /https:\/\/new\.example\.com\/mcp/);
});

test("list: shows 'no servers configured' when agent detected but empty", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  // Create .cursor dir but with empty mcpServers
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({ mcpServers: {} }),
  );

  const result = runCli(["list"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Cursor/);
  assert.match(output, /no servers configured/);
});

test("list: shows 'not detected' when -a targets absent agent", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const result = runCli(["list", "-a", "cursor"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Cursor/);
  assert.match(output, /not detected/);
});

test("list: shows help when no agents detected", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const result = runCli(["list"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /No agents detected/);
});

// ── remove command tests ─────────────────────────────────────────────────

test("remove: removes server by name with -y", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  const configPath = join(cursorDir, "mcp.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      mcpServers: {
        neon: { url: "https://mcp.neon.tech/mcp" },
        github: { command: "npx", args: ["-y", "mcp-server-github"] },
      },
    }),
  );

  const result = runCli(["remove", "neon", "-y"], projectDir, homeDir);

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  assert.strictEqual(config.mcpServers.neon, undefined);
  assert.ok(config.mcpServers.github);
});

test("remove: matches by URL identity with -y", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  const configPath = join(cursorDir, "mcp.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      mcpServers: {
        "my-neon": { url: "https://mcp.neon.tech/mcp" },
      },
    }),
  );

  const result = runCli(
    ["remove", "https://mcp.neon.tech/mcp", "-y"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  assert.strictEqual(config.mcpServers["my-neon"], undefined);
});

test("remove: matches Gemini CLI httpUrl identity with -y", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const geminiDir = join(projectDir, ".gemini");
  mkdirSync(geminiDir, { recursive: true });
  const configPath = join(geminiDir, "settings.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      mcpServers: {
        context7: {
          httpUrl: "https://mcp.context7.com/mcp",
        },
      },
    }),
  );

  const result = runCli(
    ["remove", "https://mcp.context7.com/mcp", "-y"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  assert.strictEqual(config.mcpServers.context7, undefined);
});

test("remove: prints message when no matches found", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({
      mcpServers: { neon: { url: "https://mcp.neon.tech/mcp" } },
    }),
  );

  const result = runCli(["remove", "nonexistent", "-y"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /No matching servers found/);
});

// ── sync command tests ───────────────────────────────────────────────────

test("sync: command-array fx args match Cursor args on global sync", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  mkdirSync(join(homeDir, ".cursor"), { recursive: true });
  writeFileSync(
    join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({
      mcpServers: {
        postgres: {
          command: "npx",
          args: ["-y", "mcp-server-postgres"],
        },
      },
    }),
  );

  mkdirSync(join(homeDir, ".fx"), { recursive: true });
  writeFileSync(
    join(homeDir, ".fx", "mcp.json"),
    JSON.stringify({
      mcp: {
        pg: {
          type: "local",
          command: ["npx", "-y", "mcp-server-postgres"],
          enabled: true,
        },
      },
    }),
  );

  const result = runCli(["sync", "-g", "-y"], projectDir, homeDir);

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const output = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(output, /args differ/);

  const cursorConfig = JSON.parse(
    readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8"),
  );
  const fxConfig = JSON.parse(
    readFileSync(join(homeDir, ".fx", "mcp.json"), "utf-8"),
  );
  assert.ok(cursorConfig.mcpServers.pg, "Cursor should rename to pg");
  assert.strictEqual(cursorConfig.mcpServers.postgres, undefined);
  assert.ok(fxConfig.mcp.pg, "fx should keep pg");
});

test("sync: renames servers to canonical name across agents with -y", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  // Cursor: "neon" -> URL
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  const cursorConfigPath = join(cursorDir, "mcp.json");
  writeFileSync(
    cursorConfigPath,
    JSON.stringify({
      mcpServers: {
        neon: { url: "https://mcp.neon.tech/mcp" },
      },
    }),
  );

  // Claude Code: "neon-mcp" -> same URL
  const claudeConfigPath = join(projectDir, ".mcp.json");
  writeFileSync(
    claudeConfigPath,
    JSON.stringify({
      mcpServers: {
        "neon-mcp": { url: "https://mcp.neon.tech/mcp" },
      },
    }),
  );

  const result = runCli(["sync", "-y"], projectDir, homeDir);

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  // "neon" is shorter than "neon-mcp", so canonical name should be "neon"
  const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
  assert.ok(cursorConfig.mcpServers.neon, "Cursor should keep 'neon'");

  const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, "utf-8"));
  assert.ok(
    claudeConfig.mcpServers.neon,
    "Claude Code should have 'neon' after sync",
  );
  assert.strictEqual(
    claudeConfig.mcpServers.neon.type,
    "http",
    "Claude Code entry should include type: http",
  );
  assert.strictEqual(
    claudeConfig.mcpServers.neon.url,
    "https://mcp.neon.tech/mcp",
    "Claude Code entry should include the URL",
  );
  assert.strictEqual(
    claudeConfig.mcpServers["neon-mcp"],
    undefined,
    "Claude Code should no longer have 'neon-mcp'",
  );
});

test("sync: reconstructs required fields when syncing Cursor -> Claude Code", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  // Cursor stores remote servers without 'type' (its transform strips it)
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        vercel: { url: "https://vercel.com/mcp" },
        neon: { url: "https://mcp.neon.tech/mcp" },
      },
    }),
  );

  // Claude Code has no servers yet, but .mcp.json exists
  const claudeConfigPath = join(projectDir, ".mcp.json");
  writeFileSync(claudeConfigPath, JSON.stringify({ mcpServers: {} }));

  const result = runCli(["sync", "-y"], projectDir, homeDir);

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, "utf-8"));

  // Both servers should be synced to Claude Code with type: "http"
  assert.ok(claudeConfig.mcpServers.vercel, "Claude Code should have 'vercel'");
  assert.strictEqual(
    claudeConfig.mcpServers.vercel.type,
    "http",
    "vercel should have type: http even though Cursor didn't store it",
  );
  assert.strictEqual(
    claudeConfig.mcpServers.vercel.url,
    "https://vercel.com/mcp",
  );

  assert.ok(claudeConfig.mcpServers.neon, "Claude Code should have 'neon'");
  assert.strictEqual(
    claudeConfig.mcpServers.neon.type,
    "http",
    "neon should have type: http even though Cursor didn't store it",
  );
  assert.strictEqual(
    claudeConfig.mcpServers.neon.url,
    "https://mcp.neon.tech/mcp",
  );
});

test("sync: preserves Gemini CLI httpUrl and headers", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  const geminiDir = join(projectDir, ".gemini");
  mkdirSync(geminiDir, { recursive: true });
  writeFileSync(
    join(geminiDir, "settings.json"),
    JSON.stringify({
      mcpServers: {
        context7: {
          httpUrl: "https://mcp.context7.com/mcp",
          headers: {
            CONTEXT7_API_KEY: "test",
            Accept: "application/json, text/event-stream",
          },
        },
      },
    }),
  );

  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  const cursorConfigPath = join(cursorDir, "mcp.json");
  writeFileSync(
    cursorConfigPath,
    JSON.stringify({
      mcpServers: {},
    }),
  );

  const result = runCli(["sync", "-y"], projectDir, homeDir);

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const cursorConfig = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
  assert.deepStrictEqual(cursorConfig.mcpServers.context7, {
    url: "https://mcp.context7.com/mcp",
    headers: {
      CONTEXT7_API_KEY: "test",
      Accept: "application/json, text/event-stream",
    },
  });
});

test("sync: skips servers with header conflicts", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  // Cursor: neon with headers
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        neon: {
          url: "https://mcp.neon.tech/mcp",
          headers: { Authorization: "Bearer token-a" },
        },
      },
    }),
  );

  // Claude Code: neon-mcp with different headers
  writeFileSync(
    join(projectDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "neon-mcp": {
          url: "https://mcp.neon.tech/mcp",
          headers: { Authorization: "Bearer token-b" },
        },
      },
    }),
  );

  const result = runCli(["sync", "-y"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /headers differ|Skipped|conflict/i);
});

test("sync: prints already in sync when nothing to change", () => {
  const homeDir = createTempDir();
  const projectDir = createTempDir();

  // Cursor and Claude Code with identical server name and URL
  const cursorDir = join(projectDir, ".cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(
    join(cursorDir, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        neon: { url: "https://mcp.neon.tech/mcp" },
      },
    }),
  );

  writeFileSync(
    join(projectDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        neon: { url: "https://mcp.neon.tech/mcp" },
      },
    }),
  );

  const result = runCli(["sync", "-y"], projectDir, homeDir);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /already in sync/i);
});

test("E2E CLI: Grok alias honors GROK_HOME and maps native remote fields", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  const grokHome = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/sse",
      "-a",
      "grok",
      "-g",
      "-y",
      "--name",
      "grok-remote",
      "--transport",
      "sse",
      "--header",
      "Authorization: Bearer ${API_TOKEN}",
      "--timeout",
      "2000",
    ],
    projectDir,
    homeDir,
    { GROK_HOME: grokHome },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(grokHome, "config.toml");
  assert.strictEqual(existsSync(configPath), true);
  assert.strictEqual(existsSync(join(homeDir, ".grok", "config.toml")), false);

  const saved = TOML.parse(readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const server = (saved.mcp_servers as Record<string, Record<string, unknown>>)[
    "grok-remote"
  ];
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/sse");
  assert.deepStrictEqual(server.headers, {
    Authorization: "Bearer ${API_TOKEN}",
  });
  assert.strictEqual(server.tool_timeout_sec, 2);
  assert.strictEqual("type" in server, false);
});

test("E2E CLI: Grok global install falls back to ~/.grok", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "grok-build",
      "-g",
      "-y",
      "--name",
      "grok-default-home",
    ],
    projectDir,
    homeDir,
    { GROK_HOME: "" },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(homeDir, ".grok", "config.toml");
  assert.strictEqual(existsSync(configPath), true);
  const saved = TOML.parse(readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const server = (saved.mcp_servers as Record<string, Record<string, unknown>>)[
    "grok-default-home"
  ];
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
});

test("E2E CLI: Grok project install ignores GROK_HOME", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  const grokHome = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/sse",
      "-a",
      "grok-build",
      "-y",
      "--name",
      "grok-project",
      "--transport",
      "sse",
    ],
    projectDir,
    homeDir,
    { GROK_HOME: grokHome },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".grok", "config.toml");
  assert.strictEqual(existsSync(configPath), true);
  assert.strictEqual(existsSync(join(grokHome, "config.toml")), false);

  const saved = TOML.parse(readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const server = (saved.mcp_servers as Record<string, Record<string, unknown>>)[
    "grok-project"
  ];
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/sse");
  assert.strictEqual("type" in server, false);
});

test("E2E CLI: Kiro alias installs into .kiro/settings/mcp.json", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "kiro",
      "-y",
      "--name",
      "kiro-remote",
      "--timeout",
      "60000",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(projectDir, ".kiro", "settings", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const server = saved.mcpServers["kiro-remote"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
  assert.strictEqual(server.timeout, 60000);
  assert.strictEqual("type" in server, false);
});

test("E2E CLI: Pi honors PI_CODING_AGENT_DIR for global installs", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  const piAgentDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "pi",
      "-g",
      "-y",
      "--name",
      "pi-remote",
      "--timeout",
      "5000",
    ],
    projectDir,
    homeDir,
    { PI_CODING_AGENT_DIR: piAgentDir },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(piAgentDir, "mcp.json");
  assert.strictEqual(existsSync(configPath), true);
  assert.strictEqual(
    existsSync(join(homeDir, ".pi", "agent", "mcp.json")),
    false,
  );

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const server = saved.mcpServers["pi-remote"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
  assert.strictEqual(server.requestTimeoutMs, 5000);
  assert.strictEqual("type" in server, false);
});

test("E2E CLI: Pi global install falls back to ~/.pi/agent", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    ["mcp-server-postgres", "-a", "pi", "-g", "-y", "--name", "pi-local"],
    projectDir,
    homeDir,
    { PI_CODING_AGENT_DIR: "" },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(homeDir, ".pi", "agent", "mcp.json");
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const server = saved.mcpServers["pi-local"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.command, "npx");
  assert.deepStrictEqual(server.args, ["-y", "mcp-server-postgres"]);
});

test("E2E CLI: Kimi alias honors KIMI_CODE_HOME for global installs", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  const kimiHome = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "kimi",
      "-g",
      "-y",
      "--name",
      "kimi-remote",
      "--timeout",
      "5000",
    ],
    projectDir,
    homeDir,
    { KIMI_CODE_HOME: kimiHome },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(kimiHome, "mcp.json");
  assert.strictEqual(existsSync(configPath), true);
  assert.strictEqual(
    existsSync(join(homeDir, ".kimi-code", "mcp.json")),
    false,
  );

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const server = saved.mcpServers["kimi-remote"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.transport, "http");
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
  assert.strictEqual(server.toolTimeoutMs, 5000);
});

test("E2E CLI: Kimi global install falls back to ~/.kimi-code", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "mcp-server-postgres",
      "-a",
      "kimi-code",
      "-g",
      "-y",
      "--name",
      "kimi-local",
    ],
    projectDir,
    homeDir,
    { KIMI_CODE_HOME: "" },
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const saved = JSON.parse(
    readFileSync(join(homeDir, ".kimi-code", "mcp.json"), "utf-8"),
  );
  const server = saved.mcpServers["kimi-local"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.transport, "stdio");
  assert.strictEqual(server.command, "npx");
  assert.deepStrictEqual(server.args, ["-y", "mcp-server-postgres"]);
});

test("E2E CLI: Kilo alias installs into the XDG config dir for global installs", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "kilo",
      "-g",
      "-y",
      "--name",
      "kilo-remote",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const configPath = join(homeDir, ".config", "kilo", "kilo.json");
  assert.strictEqual(existsSync(configPath), true);

  const saved = JSON.parse(readFileSync(configPath, "utf-8"));
  const server = saved.mcp["kilo-remote"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.type, "remote");
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
});

test("E2E CLI: OpenCode global install defaults to opencode.jsonc", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "opencode",
      "-g",
      "-y",
      "--name",
      "oc-remote",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const jsoncPath = join(homeDir, ".config", "opencode", "opencode.jsonc");
  assert.strictEqual(existsSync(jsoncPath), true);
  assert.strictEqual(
    existsSync(join(homeDir, ".config", "opencode", "opencode.json")),
    false,
  );

  const saved = JSON.parse(readFileSync(jsoncPath, "utf-8"));
  const server = saved.mcp["oc-remote"] as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.type, "remote");
  assert.strictEqual(server.url, "https://mcp.example.com/mcp");
});

test("E2E CLI: OpenCode global install prefers existing jsonc over json", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  const configDir = join(homeDir, ".config", "opencode");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "opencode.jsonc"), "{}");
  writeFileSync(join(configDir, "opencode.json"), "{}");

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "opencode",
      "-g",
      "-y",
      "--name",
      "oc-remote",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const jsoncPath = join(configDir, "opencode.jsonc");
  const jsonPath = join(configDir, "opencode.json");
  assert.strictEqual(existsSync(jsoncPath), true);

  const jsonc = JSON.parse(readFileSync(jsoncPath, "utf-8"));
  const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
  assert.ok(jsonc.mcp["oc-remote"]);
  assert.ok(!json.mcp);
});

test("E2E CLI: OpenCode global install reuses existing opencode.json", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();
  const configDir = join(homeDir, ".config", "opencode");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "opencode.json"), "{}");

  const result = runCli(
    ["mcp-server-postgres", "-a", "opencode", "-g", "-y", "--name", "postgres"],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  assert.strictEqual(existsSync(join(configDir, "opencode.jsonc")), false);
  const saved = JSON.parse(
    readFileSync(join(configDir, "opencode.json"), "utf-8"),
  );
  const server = saved.mcp.postgres as Record<string, unknown>;
  assert.ok(server);
  assert.strictEqual(server.type, "local");
});

test("E2E CLI: --timeout and --scopes map per agent and warn on drop", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "gemini-cli",
      "-a",
      "cursor",
      "-a",
      "vscode",
      "-y",
      "--name",
      "scoped",
      "--timeout",
      "30000",
      "--scopes",
      "read,write",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  // Gemini: timeout + oauth.scopes
  const gemini = JSON.parse(
    readFileSync(join(projectDir, ".gemini", "settings.json"), "utf-8"),
  );
  const geminiServer = gemini.mcpServers.scoped as Record<string, unknown>;
  assert.strictEqual(geminiServer.timeout, 30000);
  assert.deepStrictEqual(geminiServer.oauth, { scopes: ["read", "write"] });

  // Cursor: scopes -> auth.scopes, timeout dropped
  const cursor = JSON.parse(
    readFileSync(join(projectDir, ".cursor", "mcp.json"), "utf-8"),
  );
  const cursorServer = cursor.mcpServers.scoped as Record<string, unknown>;
  assert.deepStrictEqual(cursorServer.auth, { scopes: ["read", "write"] });
  assert.ok(!("timeout" in cursorServer));

  // VS Code: both dropped, no raw fields
  const vscode = JSON.parse(
    readFileSync(join(projectDir, ".vscode", "mcp.json"), "utf-8"),
  );
  const vscodeServer = vscode.servers.scoped as Record<string, unknown>;
  assert.ok(!("timeout" in vscodeServer));
  assert.ok(!("oauthScopes" in vscodeServer));
  assert.ok(!("auth" in vscodeServer));

  // User is warned about dropped fields
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /request timeout is not supported by/i);
  assert.match(output, /OAuth scopes is not supported by/i);
});

test("E2E CLI: --timeout with a package install warns and is ignored", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "mcp-server-postgres",
      "-a",
      "claude-code",
      "-y",
      "--name",
      "pg",
      "--timeout",
      "5000",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const saved = JSON.parse(
    readFileSync(join(projectDir, ".mcp.json"), "utf-8"),
  );
  const server = saved.mcpServers.pg as Record<string, unknown>;
  assert.ok(!("timeout" in server), "timeout is remote-only");

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /--timeout is only used for remote URLs/i);
});

test("E2E CLI: Codex auto-approve selected tool writes per-tool approval", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "executor mcp",
      "-a",
      "codex",
      "-y",
      "--name",
      "executor",
      "--auto-approve",
      "--approve-tool",
      "execute",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const saved = TOML.parse(
    readFileSync(join(projectDir, ".codex", "config.toml"), "utf-8"),
  ) as Record<string, unknown>;
  const executor = (
    saved.mcp_servers as Record<string, Record<string, unknown>>
  ).executor;
  assert.ok(executor);
  const tools = executor.tools as Record<string, unknown>;
  assert.deepStrictEqual(tools.execute, { approval_mode: "approve" });
});

test("E2E CLI: Codex --auto-approve (all tools) writes server default", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "executor mcp",
      "-a",
      "codex",
      "-y",
      "--name",
      "executor",
      "--auto-approve",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const saved = TOML.parse(
    readFileSync(join(projectDir, ".codex", "config.toml"), "utf-8"),
  ) as Record<string, unknown>;
  const executor = (
    saved.mcp_servers as Record<string, Record<string, unknown>>
  ).executor;
  assert.ok(executor);
  assert.strictEqual(executor.default_tools_approval_mode, "approve");
});

test("E2E CLI: Claude Code auto-approve selected tool writes settings.local.json", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "executor mcp",
      "-a",
      "claude-code",
      "-y",
      "--name",
      "executor",
      "--auto-approve",
      "--approve-tool",
      "execute",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  // MCP server config stays clean
  const mcp = JSON.parse(readFileSync(join(projectDir, ".mcp.json"), "utf-8"));
  const server = mcp.mcpServers.executor as Record<string, unknown>;
  assert.ok(!("autoApproveTools" in server));

  // Approval lands in the separate settings file
  const settings = JSON.parse(
    readFileSync(join(projectDir, ".claude", "settings.local.json"), "utf-8"),
  ) as Record<string, unknown>;
  const permissions = settings.permissions as Record<string, unknown>;
  assert.deepStrictEqual(permissions.allow, ["mcp__executor__execute"]);
});

test("E2E CLI: Claude Code --auto-approve (all tools) writes server-level rule", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "executor mcp",
      "-a",
      "claude-code",
      "-y",
      "--name",
      "executor",
      "--auto-approve",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const settings = JSON.parse(
    readFileSync(join(projectDir, ".claude", "settings.local.json"), "utf-8"),
  ) as Record<string, unknown>;
  const permissions = settings.permissions as Record<string, unknown>;
  assert.deepStrictEqual(permissions.allow, ["mcp__executor"]);
});

test("E2E CLI: auto-approve on an unsupported agent warns and writes no approval", () => {
  const projectDir = createTempDir();
  const homeDir = createTempDir();

  const result = runCli(
    [
      "https://mcp.example.com/mcp",
      "-a",
      "cursor",
      "-y",
      "--name",
      "remote",
      "--auto-approve",
    ],
    projectDir,
    homeDir,
  );

  if (result.status !== 0) {
    throw new Error(
      `CLI failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }

  const cursor = JSON.parse(
    readFileSync(join(projectDir, ".cursor", "mcp.json"), "utf-8"),
  );
  const server = cursor.mcpServers.remote as Record<string, unknown>;
  assert.ok(!("autoApproveTools" in server));
  assert.ok(!("tools" in server));

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /tool auto-approval is not supported by Cursor/i);
});

cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
