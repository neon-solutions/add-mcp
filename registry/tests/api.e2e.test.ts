import { beforeAll, describe, expect, it } from "vitest";

import { apiApp } from "../src/lib/api-app";

describe("mcp-registry api", () => {
  beforeAll(() => {
    process.env.MCP_REGISTRY_SOURCE_PATH = "./fixtures/registry-e2e.json";
  });

  it("responds to health checks", async () => {
    const response = await apiApp.request("http://localhost/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("lists servers with official response envelope", async () => {
    const response = await apiApp.request(
      "http://localhost/api/v1/servers?limit=2",
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      servers: Array<{ server: { name: string } }>;
      metadata: { count: number; nextCursor?: string };
    };

    expect(body.metadata.count).toBe(2);
    expect(body.servers.length).toBe(2);
    expect(typeof body.metadata.nextCursor).toBe("string");
    expect(body.servers[0]?.server.name).toBe("io.github.example/filesystem");
  });

  it("accepts website search events", async () => {
    const response = await apiApp.request("http://localhost/api/v1/searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search: "  Neon  " }),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("rejects empty website search events", async () => {
    const response = await apiApp.request("http://localhost/api/v1/searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search: "   " }),
    });

    expect(response.status).toBe(400);
  });

  it("generates openapi spec", async () => {
    const response = await apiApp.request("http://localhost/api/openapi.json");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };

    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("add-mcp registry API");
    expect(body.paths["/api/v1/servers"]).toBeTruthy();
    expect(body.paths["/api/v1/searches"]).toBeTruthy();
  });
});
