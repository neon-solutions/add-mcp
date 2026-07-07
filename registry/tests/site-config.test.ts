import { describe, expect, it } from "vitest";

import { getSiteConfig } from "../src/lib/site-config";

describe("getSiteConfig", () => {
  it("returns the add-mcp registry branding", () => {
    const site = getSiteConfig();
    expect(site.name).toBe("add-mcp registry");
    expect(site.repositoryUrl).toBe(
      "https://github.com/neon-solutions/add-mcp",
    );
    expect(site.logoUrl).toBeNull();
  });
});
