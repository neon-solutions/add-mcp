import { describe, expect, it } from "vitest";

import {
  displayServerName,
  publisherFromNamespace,
} from "../src/lib/publisher";

describe("publisherFromNamespace", () => {
  it("reverses reverse-DNS namespaces into domains", () => {
    expect(publisherFromNamespace("com.neon")).toEqual({
      label: "neon.com",
      url: "https://neon.com",
    });
    expect(publisherFromNamespace("app.linear")).toEqual({
      label: "linear.app",
      url: "https://linear.app",
    });
    expect(publisherFromNamespace("dev.firecrawl")).toEqual({
      label: "firecrawl.dev",
      url: "https://firecrawl.dev",
    });
  });

  it("handles namespaces with more than two segments", () => {
    expect(publisherFromNamespace("com.googleapis.homegraph")).toEqual({
      label: "homegraph.googleapis.com",
      url: "https://homegraph.googleapis.com",
    });
  });

  it("maps GitHub-verified namespaces to the GitHub account", () => {
    expect(publisherFromNamespace("io.github.octocat")).toEqual({
      label: "github.com/octocat",
      url: "https://github.com/octocat",
    });
    expect(publisherFromNamespace("io.github.mongodb-js")).toEqual({
      label: "github.com/mongodb-js",
      url: "https://github.com/mongodb-js",
    });
  });

  it("returns single-segment namespaces unchanged without a link", () => {
    expect(publisherFromNamespace("localhost")).toEqual({
      label: "localhost",
    });
  });
});

describe("displayServerName", () => {
  it("replaces the namespace with the real-world publisher", () => {
    expect(displayServerName("com.neon/mcp")).toBe("neon.com/mcp");
    expect(displayServerName("io.github.octocat/server")).toBe(
      "github.com/octocat/server",
    );
    expect(displayServerName("app.linear/mcp")).toBe("linear.app/mcp");
  });

  it("keeps single-segment namespaces as-is", () => {
    expect(displayServerName("localhost/dev-server")).toBe(
      "localhost/dev-server",
    );
  });
});
