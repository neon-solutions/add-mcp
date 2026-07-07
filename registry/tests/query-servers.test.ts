import { describe, expect, it } from "vitest";

import {
  queryServers,
  searchQueryForServerName,
} from "../src/lib/query-servers";
import type { ServerEntry } from "../src/lib/schema";

function entry(server: ServerEntry["server"]): ServerEntry {
  return { server };
}

describe("queryServers", () => {
  it("does not match Vercel-hosted apps for exact Vercel searches", () => {
    const result = queryServers(
      [
        entry({
          name: "app.vercel.demo-chatgpt-app/mcp",
          title: "Demo",
          description: "A demo MCP server hosted on Vercel.",
          version: "1.0.0",
          remotes: [
            {
              type: "streamable-http",
              url: "https://demo-chatgpt-app.vercel.app/mcp",
            },
          ],
        }),
        entry({
          name: "app.vercel.pazy-mcp-vercel/mcp",
          title: "Pazy",
          description: "Pazy MCP server discovered by integrations.sh.",
          version: "1.0.0",
          remotes: [
            {
              type: "streamable-http",
              url: "https://pazy-mcp-vercel.vercel.app/mcp",
            },
          ],
        }),
        entry({
          name: "com.vercel/mcp",
          title: "Vercel",
          description: "Official Vercel MCP server.",
          version: "1.0.0",
          remotes: [
            {
              type: "streamable-http",
              url: "https://mcp.vercel.com",
            },
          ],
        }),
        entry({
          name: "io.github.vercel/next-devtools-mcp",
          title: "Next.js Devtools",
          description: "Next.js development tools MCP server.",
          version: "0.3.6",
          repository: {
            source: "github",
            url: "https://github.com/vercel/next-devtools-mcp",
          },
          packages: [
            {
              registryType: "npm",
              identifier: "next-devtools-mcp",
              transport: { type: "stdio" },
            },
          ],
        }),
      ],
      { search: "vercel", limit: "100" },
    );

    expect(result.servers.map((item) => item.server.name).sort()).toEqual([
      "com.vercel/mcp",
      "io.github.vercel/next-devtools-mcp",
    ]);
  });

  it("does not match every GitHub-hosted namespace for GitHub searches", () => {
    const result = queryServers(
      [
        entry({
          name: "io.github.example/filesystem",
          description: "Filesystem MCP server.",
          version: "1.0.0",
          repository: {
            source: "github",
            url: "https://github.com/example/filesystem",
          },
        }),
        entry({
          name: "io.github.github/github-mcp-server",
          title: "GitHub",
          description: "Official GitHub MCP server.",
          version: "1.0.0",
          remotes: [
            {
              type: "streamable-http",
              url: "https://api.githubcopilot.com/mcp/",
            },
          ],
        }),
        entry({
          name: "io.github.someone/github-helper",
          title: "GitHub Helper",
          description: "GitHub issue helper.",
          version: "1.0.0",
          repository: {
            source: "github",
            url: "https://github.com/someone/github-helper",
          },
        }),
      ],
      { search: "github", limit: "100" },
    );

    expect(result.servers.map((item) => item.server.name).sort()).toEqual([
      "io.github.github/github-mcp-server",
      "io.github.someone/github-helper",
    ]);
  });
});

describe("searchQueryForServerName", () => {
  it("keeps regular namespaces intact", () => {
    expect(searchQueryForServerName("com.neon/mcp")).toBe("com.neon/mcp");
  });

  it("strips hosted-provider prefixes that are excluded from search text", () => {
    expect(searchQueryForServerName("io.github.github/github-mcp-server")).toBe(
      "github/github-mcp-server",
    );
  });

  it("resolves the exact server through queryServers", () => {
    const entries: ServerEntry[] = [
      entry({
        name: "io.github.example/filesystem",
        description: "Filesystem MCP server.",
        version: "1.0.0",
      }),
      entry({
        name: "io.github.example/weather",
        description: "Weather MCP server.",
        version: "1.0.0",
      }),
    ];

    const result = queryServers(entries, {
      search: searchQueryForServerName("io.github.example/weather"),
      limit: "10",
    });

    expect(result.servers.map((item) => item.server.name)).toEqual([
      "io.github.example/weather",
    ]);
  });
});
