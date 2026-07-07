import { describe, expect, it } from "vitest";

import { BRAND } from "../src/lib/brand";
import { getSiteConfig } from "../src/lib/site-config";

describe("getSiteConfig", () => {
  it("returns baked-in add-mcp registry branding", () => {
    const site = getSiteConfig();
    expect(site.name).toBe(BRAND.registryName);
    expect(site.description).toBe(BRAND.description);
    expect(site.repositoryUrl).toBe(BRAND.githubUrl);
  });
});
