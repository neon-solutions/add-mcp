import { beforeAll, describe, expect, it } from "vitest";

import { apiApp } from "../src/lib/api-app";

const REMOTE_REGISTRY_URL =
  "https://raw.githubusercontent.com/neondatabase/add-mcp/main/registry.json";

describe("mcp-registry api (remote source)", () => {
  beforeAll(() => {
    process.env.MCP_REGISTRY_SOURCE_PATH = REMOTE_REGISTRY_URL;
  });

  it("loads servers from a remote URL", async () => {
    const response = await apiApp.request(
      "http://localhost/api/v1/servers?limit=100",
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      servers: Array<{ server: { name: string; title?: string } }>;
      metadata: { count: number };
    };

    expect(body.metadata.count).toBeGreaterThan(0);
    expect(body.servers.length).toBeGreaterThan(0);
    expect(body.servers[0]?.server.name).toBeTruthy();
  });

  it("supports search against remote registry", async () => {
    const response = await apiApp.request(
      "http://localhost/api/v1/servers?search=neon",
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      servers: Array<{ server: { name: string } }>;
      metadata: { count: number };
    };

    expect(body.servers.length).toBeGreaterThan(0);
    for (const entry of body.servers) {
      expect(entry.server.name.toLowerCase()).toContain("neon");
    }
  });

  it("paginates remote registry results", async () => {
    const firstPage = await apiApp.request(
      "http://localhost/api/v1/servers?limit=2",
    );
    expect(firstPage.status).toBe(200);

    const firstBody = (await firstPage.json()) as {
      servers: Array<{ server: { name: string } }>;
      metadata: { count: number; nextCursor?: string };
    };

    expect(firstBody.metadata.count).toBe(2);
    expect(firstBody.metadata.nextCursor).toBeTruthy();

    const secondPage = await apiApp.request(
      `http://localhost/api/v1/servers?limit=2&cursor=${firstBody.metadata.nextCursor}`,
    );
    expect(secondPage.status).toBe(200);

    const secondBody = (await secondPage.json()) as {
      servers: Array<{ server: { name: string } }>;
      metadata: { count: number };
    };

    expect(secondBody.metadata.count).toBe(2);
    expect(secondBody.servers[0]?.server.name).not.toBe(
      firstBody.servers[0]?.server.name,
    );
  });
});
