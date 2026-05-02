#!/usr/bin/env tsx

import assert from "node:assert";
import {
  buildInstallPlanForEntry,
  buildPlaceholderValue,
  collectPromptValues,
  filterSmitheryWhenAlternativesExist,
  formatFindResultRow,
  formatRegistryFailure,
  getDefaultFindRegistries,
  rankRegistryEntries,
  resolveOfficialRegistryServersUrl,
  resolveServerName,
  resolveTemplateUrl,
  searchRegistry,
} from "../src/find.js";
import type { RegistryServerEntry } from "../src/find.js";

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

const officialServersFixture: RegistryServerEntry[] = [
  {
    name: "app.linear/linear",
    description: "MCP server for Linear project management and issue tracking",
    version: "1.0.0",
    remotes: [
      { type: "streamable-http", url: "https://mcp.linear.app/mcp" },
      { type: "sse", url: "https://mcp.linear.app/sse" },
    ],
  },
  {
    name: "com.atlassian/atlassian-mcp-server",
    title: "Atlassian Rovo MCP Server",
    description: "Atlassian Rovo MCP Server",
    version: "1.1.1",
    repositoryUrl: "https://github.com/atlassian/atlassian-mcp-server",
    remotes: [
      { type: "streamable-http", url: "https://mcp.atlassian.com/v1/mcp" },
      { type: "sse", url: "https://mcp.atlassian.com/v1/sse" },
    ],
  },
  {
    name: "com.cloudflare.mcp/mcp",
    description: "Cloudflare MCP servers",
    version: "1.0.0",
    remotes: [
      { type: "streamable-http", url: "https://docs.mcp.cloudflare.com/mcp" },
    ],
  },
  {
    name: "com.supabase/mcp",
    title: "Supabase",
    description: "MCP server for interacting with Supabase",
    version: "0.6.3",
    remotes: [{ type: "streamable-http", url: "https://mcp.supabase.com/mcp" }],
    package: {
      registryType: "npm",
      identifier: "@supabase/mcp-server-supabase",
      version: "0.6.3",
      transport: { type: "stdio" },
    },
  },
  {
    name: "com.vercel/vercel-mcp",
    description: "An MCP server for Vercel",
    version: "0.0.3",
    remotes: [{ type: "streamable-http", url: "https://mcp.vercel.com" }],
  },
  {
    name: "com.stripe/mcp",
    description: "MCP server integrating with Stripe",
    version: "0.2.4",
    remotes: [{ type: "streamable-http", url: "https://mcp.stripe.com" }],
  },
  {
    name: "com.notion/mcp",
    description: "Official Notion MCP server",
    version: "1.0.1",
    remotes: [{ type: "streamable-http", url: "https://mcp.notion.com/mcp" }],
  },
  {
    name: "com.postman/postman-mcp-server",
    description: "Postman MCP server for Postman API workflows",
    version: "2.7.0",
    remotes: [{ type: "streamable-http", url: "https://mcp.postman.com/mcp" }],
    package: {
      registryType: "npm",
      identifier: "@postman/postman-mcp-server",
      version: "2.7.0",
      transport: { type: "stdio" },
    },
  },
  {
    name: "io.github.getsentry/sentry-mcp",
    description: "MCP server for Sentry issue tracking and debugging",
    version: "0.25.0",
    package: {
      registryType: "npm",
      identifier: "@sentry/mcp-server",
      version: "0.25.0",
      transport: { type: "stdio" },
    },
  },
  {
    name: "io.github.github/github-mcp-server",
    title: "GitHub",
    description: "Official GitHub MCP server",
    version: "0.31.0",
    remotes: [
      {
        type: "streamable-http",
        url: "https://api.githubcopilot.com/mcp/",
      },
    ],
  },
  {
    name: "io.github.mongodb-js/mongodb-mcp-server",
    description: "MongoDB Model Context Protocol server",
    version: "1.6.0",
    package: {
      registryType: "npm",
      identifier: "mongodb-mcp-server",
      version: "1.6.0",
      transport: { type: "stdio" },
    },
  },
  {
    name: "io.github.railwayapp/mcp-server",
    description: "Official Railway MCP server",
    version: "0.1.5",
    package: {
      registryType: "npm",
      identifier: "@railway/mcp-server",
      version: "0.1.5",
      transport: { type: "stdio" },
    },
  },
  {
    name: "io.github.vercel/next-devtools-mcp",
    description: "Next.js development tools MCP server with stdio transport",
    version: "0.3.6",
    package: {
      registryType: "npm",
      identifier: "next-devtools-mcp",
      version: "0.3.6",
      transport: { type: "stdio" },
    },
  },
];

function toApiServerShape(entry: RegistryServerEntry) {
  const { package: pkg, repositoryUrl, ...rest } = entry;
  return {
    server: {
      ...rest,
      packages: pkg ? [pkg] : undefined,
      repository: repositoryUrl
        ? { url: repositoryUrl, source: "github" }
        : undefined,
    },
  };
}

test("searchRegistry maps API response entries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        servers: officialServersFixture.map(toApiServerShape),
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await searchRegistry("supabase", [
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official Anthropic registry",
      },
    ]);
    const results = result.entries;
    assert.strictEqual(result.failedRegistries.length, 0);
    assert.strictEqual(results.length, officialServersFixture.length);
    assert.strictEqual(
      results.some((entry) => entry.name === "com.supabase/mcp"),
      true,
    );
    assert.strictEqual(
      results.some(
        (entry) => entry.name === "io.github.github/github-mcp-server",
      ),
      true,
    );
    assert.strictEqual(
      results.find(
        (entry) => entry.name === "com.atlassian/atlassian-mcp-server",
      )?.repositoryUrl,
      "https://github.com/atlassian/atlassian-mcp-server",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchRegistry returns failure info on non-ok response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as Response) as typeof fetch;

  try {
    const result = await searchRegistry("supabase", [
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official Anthropic registry",
      },
    ]);
    assert.strictEqual(result.entries.length, 0);
    assert.strictEqual(result.failedRegistries.length, 1);
    assert.strictEqual(result.failedRegistries[0]?.detail, "HTTP 500");
    assert.strictEqual(
      result.failedRegistries[0]?.registry.label,
      "Official Anthropic registry",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchRegistry merges registries and skips failed sources", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://verified.local/api/v1/servers")) {
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        servers: [
          {
            server: {
              name: "com.supabase/mcp",
              description: "Supabase MCP",
              version: "0.6.3",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://mcp.supabase.com/mcp",
                },
              ],
            },
          },
          {
            server: {
              name: "com.postman/postman-mcp-server",
              description: "Postman MCP",
              version: "2.7.0",
              remotes: [
                { type: "streamable-http", url: "https://mcp.postman.com/mcp" },
              ],
            },
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await searchRegistry("mcp", [
      {
        url: "https://verified.local/api/v1/servers",
        label: "add-mcp curated registry",
      },
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official Anthropic registry",
      },
    ]);

    assert.strictEqual(result.entries.length, 2);
    assert.strictEqual(result.failedRegistries.length, 1);
    assert.strictEqual(
      result.failedRegistries[0]?.registry.label,
      "add-mcp curated registry",
    );
    assert.strictEqual(result.failedRegistries[0]?.detail, "HTTP 503");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rankRegistryEntries prioritizes official GitHub over smithery noise", () => {
  const ranked = rankRegistryEntries("github", [
    {
      name: "ai.smithery/Hint-Services-obsidian-github-mcp",
      description: "Community server",
      version: "1.0.0",
    },
    {
      name: "io.github.github/github-mcp-server",
      title: "GitHub",
      description: "Official GitHub MCP server",
      version: "0.31.0",
    },
  ]);

  assert.strictEqual(ranked[0]?.name, "io.github.github/github-mcp-server");
});

test("filterSmitheryWhenAlternativesExist removes smithery when non-smithery exists", () => {
  const filtered = filterSmitheryWhenAlternativesExist([
    {
      name: "ai.smithery/smithery-github",
      description: "smithery result",
      version: "1.0.0",
    },
    {
      name: "io.github.github/github-mcp-server",
      description: "official github",
      version: "0.31.0",
    },
  ]);

  assert.deepStrictEqual(
    filtered.map((entry) => entry.name),
    ["io.github.github/github-mcp-server"],
  );
});

test("filterSmitheryWhenAlternativesExist keeps smithery when only smithery exists", () => {
  const filtered = filterSmitheryWhenAlternativesExist([
    {
      name: "ai.smithery/smithery-github",
      description: "smithery result",
      version: "1.0.0",
    },
  ]);

  assert.deepStrictEqual(
    filtered.map((entry) => entry.name),
    ["ai.smithery/smithery-github"],
  );
});

test("rankRegistryEntries prioritizes official Supabase over smithery entries", () => {
  const ranked = rankRegistryEntries("supa", [
    {
      name: "ai.smithery/supa-community-fork",
      description: "Community Supabase tool",
      version: "1.0.0",
    },
    {
      name: "com.supabase/mcp",
      title: "Supabase",
      description: "MCP server for interacting with Supabase",
      version: "0.6.3",
    },
    {
      name: "io.github.someone/supabase-helper",
      description: "Third-party helper",
      version: "1.0.0",
    },
  ]);

  assert.strictEqual(ranked[0]?.name, "com.supabase/mcp");
});

test("formatFindResultRow shows title, name, and transport labels", () => {
  const row = formatFindResultRow({
    name: "com.supabase/mcp",
    title: "Supabase",
    description: "MCP server for interacting with Supabase",
    version: "0.6.3",
    repositoryUrl: "https://github.com/supabase-community/supabase-mcp",
    remotes: [{ type: "streamable-http", url: "https://mcp.supabase.com/mcp" }],
    package: {
      registryType: "npm",
      identifier: "@supabase/mcp-server-supabase",
      version: "0.6.3",
      transport: { type: "stdio" },
    },
  });

  assert.strictEqual(row, "Supabase (com.supabase/mcp) [stdio, remote]");
});

test("formatFindResultRow falls back to name when no title", () => {
  const row = formatFindResultRow({
    name: "com.example/no-repo",
    description: "No repository metadata",
    version: "1.0.0",
    remotes: [{ type: "streamable-http", url: "https://example.com/mcp" }],
  });

  assert.strictEqual(row, "com.example/no-repo (com.example/no-repo) [remote]");
});

test("buildInstallPlanForEntry defaults to remote in -y for hybrid entries", async () => {
  const hybridEntry = officialServersFixture.find(
    (entry) => entry.name === "com.supabase/mcp",
  );
  assert.ok(hybridEntry);
  const plan = await buildInstallPlanForEntry(hybridEntry!, { yes: true });
  assert.ok(plan);
  assert.strictEqual(plan?.target, "https://mcp.supabase.com/mcp");
  assert.strictEqual(plan?.transport, "http");
  assert.strictEqual(plan?.serverName, "supabase");
});

test("resolveServerName uses lowercased title when present", () => {
  const name = resolveServerName({
    name: "com.postman/postman-mcp-server",
    title: "Postman",
    description: "Postman MCP server for Postman API workflows",
    version: "2.7.0",
  });
  assert.strictEqual(name, "postman");
});

test("resolveServerName removes com and mcp from fallback name", () => {
  const name = resolveServerName({
    name: "com.neon.mcp",
    description: "Neon MCP server",
    version: "1.0.0",
  });
  assert.strictEqual(name, "neon");
});

test("resolveTemplateUrl replaces provided variables only", () => {
  const resolved = resolveTemplateUrl(
    "https://{tenant}.example.com/{region}/mcp",
    {
      tenant: "acme",
    },
  );
  assert.strictEqual(resolved, "https://acme.example.com/{region}/mcp");
});

test("collectPromptValues uses placeholder for empty required, omits empty optional", async () => {
  const calls: string[] = [];

  const result = await collectPromptValues(
    [
      {
        key: "project_id",
        label: "Variable project_id",
        isRequired: true,
        placeholder: buildPlaceholderValue("variable"),
      },
      {
        key: "Authorization",
        label: "Header Authorization",
        isRequired: false,
        placeholder: buildPlaceholderValue("header"),
      },
    ],
    async (field) => {
      calls.push(field.key);
      return "";
    },
  );

  assert.strictEqual(result.cancelled, false);
  assert.deepStrictEqual(result.values, {
    project_id: buildPlaceholderValue("variable"),
  });
  assert.deepStrictEqual(calls, ["project_id", "Authorization"]);
});

test("collectPromptValues keeps user-provided values for required fields", async () => {
  const result = await collectPromptValues(
    [
      {
        key: "project_id",
        label: "Variable project_id",
        isRequired: true,
        placeholder: buildPlaceholderValue("variable"),
      },
    ],
    async () => "project-123",
  );

  assert.strictEqual(result.cancelled, false);
  assert.deepStrictEqual(result.values, { project_id: "project-123" });
});

async function runRequirementMatrixCase(
  variableRequired: boolean,
  headerRequired: boolean,
): Promise<{
  values: Record<string, string>;
  calls: string[];
}> {
  const calls: string[] = [];

  const result = await collectPromptValues(
    [
      {
        key: "tenant_id",
        label: "Variable tenant_id",
        isRequired: variableRequired,
        placeholder: buildPlaceholderValue("variable"),
      },
      {
        key: "Authorization",
        label: "Header Authorization",
        isRequired: headerRequired,
        placeholder: buildPlaceholderValue("header"),
      },
    ],
    async (field) => {
      calls.push(field.key);
      return "";
    },
  );

  assert.strictEqual(result.cancelled, false);
  return { values: result.values, calls };
}

test("matrix: variable optional + header optional", async () => {
  const result = await runRequirementMatrixCase(false, false);
  assert.deepStrictEqual(result.values, {});
  assert.deepStrictEqual(result.calls, ["tenant_id", "Authorization"]);
});

test("matrix: variable required + header optional", async () => {
  const result = await runRequirementMatrixCase(true, false);
  assert.deepStrictEqual(result.values, {
    tenant_id: buildPlaceholderValue("variable"),
  });
  assert.deepStrictEqual(result.calls, ["tenant_id", "Authorization"]);
});

test("matrix: variable optional + header required", async () => {
  const result = await runRequirementMatrixCase(false, true);
  assert.deepStrictEqual(result.values, {
    Authorization: buildPlaceholderValue("header"),
  });
  assert.deepStrictEqual(result.calls, ["tenant_id", "Authorization"]);
});

test("matrix: variable required + header required", async () => {
  const result = await runRequirementMatrixCase(true, true);
  assert.deepStrictEqual(result.values, {
    tenant_id: buildPlaceholderValue("variable"),
    Authorization: buildPlaceholderValue("header"),
  });
  assert.deepStrictEqual(result.calls, ["tenant_id", "Authorization"]);
});

test("buildInstallPlanForEntry injects placeholders in -y mode", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.example/templated",
      description: "Templated remote",
      version: "1.0.0",
      remotes: [
        {
          type: "streamable-http",
          url: "https://api.example.com/{tenant}/mcp",
          variables: {
            tenant: { isRequired: true },
          },
          headers: [{ name: "Authorization", isRequired: true }],
        },
      ],
    },
    { yes: true },
  );

  assert.ok(plan);
  assert.strictEqual(
    plan?.target,
    "https://api.example.com/<your-variable-value-here>/mcp",
  );
  assert.deepStrictEqual(plan?.headers, {
    Authorization: "<your-header-value-here>",
  });
});

test("searchRegistry fetches entries for blank query (browse mode)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.strictEqual(
      url.includes("search="),
      false,
      "browse request should not include search param",
    );
    return {
      ok: true,
      json: async () => ({
        servers: officialServersFixture.map(toApiServerShape),
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await searchRegistry("   ", [
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official",
      },
    ]);
    assert.strictEqual(result.entries.length, officialServersFixture.length);
    assert.strictEqual(result.failedRegistries.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchRegistry fetches entries for empty string query (browse mode)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        servers: officialServersFixture.slice(0, 3).map(toApiServerShape),
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await searchRegistry("", [
      {
        url: "https://registry.modelcontextprotocol.io/v0.1/servers",
        label: "Official",
      },
    ]);
    assert.strictEqual(result.entries.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveOfficialRegistryServersUrl returns the default registry URL", () => {
  const url = resolveOfficialRegistryServersUrl();
  assert.strictEqual(
    url,
    "https://registry.modelcontextprotocol.io/v0.1/servers",
  );
});

test("buildInstallPlanForEntry returns package target for package-only entry", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "io.github.getsentry/sentry-mcp",
      description: "Sentry MCP server",
      version: "0.25.0",
      package: {
        registryType: "npm",
        identifier: "@sentry/mcp-server",
        version: "0.25.0",
        transport: { type: "stdio" },
      },
    },
    { yes: true },
  );
  assert.ok(plan);
  assert.strictEqual(plan?.target, "@sentry/mcp-server");
  assert.strictEqual(plan?.transport, undefined);
  assert.strictEqual(plan?.headers, undefined);
  assert.strictEqual(plan?.env, undefined);
  assert.strictEqual(plan?.args, undefined);
});

test("buildInstallPlanForEntry includes only required package env/header/args placeholders in -y mode", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.example/with-inputs",
      description: "Package with optional and required values",
      version: "1.0.0",
      package: {
        registryType: "npm",
        identifier: "@example/with-inputs",
        transport: { type: "stdio" },
        environmentVariables: [
          { name: "REQUIRED_ENV", isRequired: true },
          { name: "OPTIONAL_ENV", isRequired: false },
        ],
        headers: [
          { name: "Authorization", isRequired: true },
          { name: "X-Optional", isRequired: false },
        ],
        packageArguments: [
          { type: "named", name: "--required-arg", isRequired: true },
          { type: "named", name: "--optional-arg", isRequired: false },
        ],
      },
    },
    { yes: true },
  );

  assert.ok(plan);
  assert.strictEqual(plan?.target, "@example/with-inputs");
  assert.deepStrictEqual(plan?.env, {
    REQUIRED_ENV: "<your-variable-value-here>",
  });
  assert.deepStrictEqual(plan?.headers, {
    Authorization: "<your-header-value-here>",
  });
  assert.deepStrictEqual(plan?.args, [
    "--required-arg",
    "<your-variable-value-here>",
  ]);
});

test("buildInstallPlanForEntry omits env/headers/args when all package inputs are optional in -y mode", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.example/all-optional",
      description: "Package with only optional values",
      version: "1.0.0",
      package: {
        registryType: "npm",
        identifier: "@example/all-optional",
        transport: { type: "stdio" },
        environmentVariables: [{ name: "OPT_ENV", isRequired: false }],
        headers: [{ name: "X-Optional", isRequired: false }],
        packageArguments: [
          { type: "named", name: "--verbose", isRequired: false },
        ],
      },
    },
    { yes: true },
  );

  assert.ok(plan);
  assert.strictEqual(plan?.target, "@example/all-optional");
  assert.strictEqual(plan?.env, undefined);
  assert.strictEqual(plan?.headers, undefined);
  assert.strictEqual(plan?.args, undefined);
});

test("buildInstallPlanForEntry merges named packageArguments in -y mode", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.example/multi-arg-fields",
      description: "Package using multiple named flags",
      version: "1.0.0",
      package: {
        registryType: "npm",
        identifier: "@example/multi-arg-fields",
        transport: { type: "stdio" },
        packageArguments: [
          { type: "named", name: "--from-arguments", isRequired: true },
          {
            type: "named",
            name: "--from-command-arguments",
            isRequired: true,
          },
        ],
      },
    },
    { yes: true },
  );

  assert.ok(plan);
  assert.deepStrictEqual(plan?.args, [
    "--from-arguments",
    "<your-variable-value-here>",
    "--from-command-arguments",
    "<your-variable-value-here>",
  ]);
});

test("buildInstallPlanForEntry filters blank-name env variables in -y mode", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.example/blank-env",
      description: "Package with blank env names",
      version: "1.0.0",
      package: {
        registryType: "npm",
        identifier: "@example/blank-env",
        transport: { type: "stdio" },
        environmentVariables: [
          { name: "", isRequired: true },
          { name: "   ", isRequired: true },
          { name: "VALID_KEY", isRequired: true },
        ],
      },
    },
    { yes: true },
  );

  assert.ok(plan);
  assert.deepStrictEqual(plan?.env, {
    VALID_KEY: "<your-variable-value-here>",
  });
});

test("buildInstallPlanForEntry uses positional packageArguments in -y mode", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.example/arg-fallbacks",
      description: "Package with mixed positional args",
      version: "1.0.0",
      package: {
        registryType: "npm",
        identifier: "@example/arg-fallbacks",
        transport: { type: "stdio" },
        packageArguments: [
          { type: "positional", value: "/path/to/db" },
          {
            type: "positional",
            description: "The workspace directory",
            isRequired: true,
          },
          { type: "positional", valueHint: "slot3", isRequired: true },
        ],
      },
    },
    { yes: true },
  );

  assert.ok(plan);
  assert.deepStrictEqual(plan?.args, [
    "/path/to/db",
    "<your-variable-value-here>",
    "<your-variable-value-here>",
  ]);
});

test("buildInstallPlanForEntry returns null when entry has no remotes or packages", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.empty/nothing",
      description: "No install targets",
      version: "1.0.0",
    },
    { yes: true },
  );
  assert.strictEqual(plan, null);
});

test("formatFindResultRow shows stdio for package-only entries", () => {
  const row = formatFindResultRow({
    name: "io.github.getsentry/sentry-mcp",
    title: "Sentry",
    description: "Sentry MCP server",
    version: "0.25.0",
    package: {
      registryType: "npm",
      identifier: "@sentry/mcp-server",
      version: "0.25.0",
      transport: { type: "stdio" },
    },
  });
  assert.strictEqual(row, "Sentry (io.github.getsentry/sentry-mcp) [stdio]");
});

test("formatFindResultRow shows unknown transport when neither remote nor package", () => {
  const row = formatFindResultRow({
    name: "com.empty/nothing",
    description: "Nothing installable",
    version: "1.0.0",
  });
  assert.strictEqual(row, "com.empty/nothing (com.empty/nothing) [unknown]");
});

test("resolveServerName returns 'server' as ultimate fallback", () => {
  const name = resolveServerName({
    name: "...",
    description: "Edge case name",
    version: "1.0.0",
  });
  assert.strictEqual(name, "server");
});

test("formatRegistryFailure shows label for known registries", () => {
  const msg = formatRegistryFailure({
    registry: {
      url: "https://mcp.agent-tooling.dev/api/v1/servers",
      label: "add-mcp curated registry",
    },
    detail: "HTTP 500",
  });
  assert.strictEqual(msg.includes('"add-mcp curated registry"'), true);
  assert.strictEqual(
    msg.includes("https://mcp.agent-tooling.dev/api/v1/servers"),
    true,
  );
  assert.strictEqual(msg.includes("HTTP 500"), true);
});

test("formatRegistryFailure shows only URL for custom registries", () => {
  const msg = formatRegistryFailure({
    registry: {
      url: "https://custom.example.com/servers",
    },
    detail: "HTTP 503",
  });
  assert.strictEqual(
    msg.startsWith("Registry https://custom.example.com/servers"),
    true,
  );
  assert.strictEqual(msg.includes("HTTP 503"), true);
});

test("getDefaultFindRegistries returns two hardcoded registries", () => {
  const defaults = getDefaultFindRegistries();
  assert.strictEqual(defaults.length, 2);
  assert.ok(defaults[0]?.url.includes("agent-tooling.dev"));
  assert.ok(defaults[1]?.url.includes("modelcontextprotocol.io"));
});

test("buildInstallPlanForEntry picks SSE remote when preferred transport is sse", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "app.linear/linear",
      description: "Linear MCP server",
      version: "1.0.0",
      remotes: [
        { type: "streamable-http", url: "https://mcp.linear.app/mcp" },
        { type: "sse", url: "https://mcp.linear.app/sse" },
      ],
    },
    { yes: true, preferredTransport: "sse" },
  );
  assert.ok(plan);
  assert.strictEqual(plan?.target, "https://mcp.linear.app/sse");
  assert.strictEqual(plan?.transport, "sse");
});

test("buildInstallPlanForEntry defaults to streamable-http when no transport preference", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "app.linear/linear",
      description: "Linear MCP server",
      version: "1.0.0",
      remotes: [
        { type: "sse", url: "https://mcp.linear.app/sse" },
        { type: "streamable-http", url: "https://mcp.linear.app/mcp" },
      ],
    },
    { yes: true },
  );
  assert.ok(plan);
  assert.strictEqual(plan?.target, "https://mcp.linear.app/mcp");
  assert.strictEqual(plan?.transport, "http");
});

test("buildInstallPlanForEntry falls back to available remote when preferred transport missing", async () => {
  const plan = await buildInstallPlanForEntry(
    {
      name: "com.cloudflare.mcp/mcp",
      description: "Cloudflare MCP",
      version: "1.0.0",
      remotes: [
        { type: "streamable-http", url: "https://docs.mcp.cloudflare.com/mcp" },
      ],
    },
    { yes: true, preferredTransport: "sse" },
  );
  assert.ok(plan);
  assert.strictEqual(plan?.target, "https://docs.mcp.cloudflare.com/mcp");
  assert.strictEqual(plan?.transport, "http");
});

test("searchRegistry filters out non-installable entries (no npm package and no remotes)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        servers: [
          {
            server: {
              name: "com.example/oci-only",
              description: "OCI-only server with no remotes",
              version: "1.0.0",
              packages: [
                {
                  registryType: "oci",
                  identifier: "ghcr.io/example/mcp",
                  version: "1.0.0",
                  transport: { type: "stdio" },
                },
              ],
            },
          },
          {
            server: {
              name: "com.example/metadata-only",
              description: "Just metadata, no transports",
              version: "0.1.0",
            },
          },
          {
            server: {
              name: "com.example/npm-server",
              description: "NPM server",
              version: "1.0.0",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@example/mcp-server",
                  version: "1.0.0",
                  transport: { type: "stdio" },
                },
              ],
            },
          },
          {
            server: {
              name: "com.example/remote-only",
              description: "Remote-only server",
              version: "1.0.0",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://example.com/mcp",
                },
              ],
            },
          },
          {
            server: {
              name: "com.example/hybrid",
              description: "Has both npm and remote",
              version: "1.0.0",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@example/hybrid",
                  version: "1.0.0",
                  transport: { type: "stdio" },
                },
              ],
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://example.com/hybrid/mcp",
                },
              ],
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await searchRegistry("example", [
      {
        url: "https://test.example.com/api/v1/servers",
        label: "Test",
      },
    ]);
    const names = result.entries.map((e) => e.name);
    assert.strictEqual(result.entries.length, 3);
    assert.strictEqual(names.includes("com.example/npm-server"), true);
    assert.strictEqual(names.includes("com.example/remote-only"), true);
    assert.strictEqual(names.includes("com.example/hybrid"), true);
    assert.strictEqual(names.includes("com.example/oci-only"), false);
    assert.strictEqual(names.includes("com.example/metadata-only"), false);
    const hybrid = result.entries.find((e) => e.name === "com.example/hybrid")!;
    assert.strictEqual(hybrid.package?.identifier, "@example/hybrid");
    assert.strictEqual(
      hybrid.remotes?.[0]?.url,
      "https://example.com/hybrid/mcp",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

testChain.then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
