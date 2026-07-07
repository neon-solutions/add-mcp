import { describe, expect, it } from "vitest";

import { normalizeBasePath } from "../src/lib/base-path";

describe("normalizeBasePath", () => {
  it("returns empty string when unset or blank", () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("   ")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("ensures a leading slash", () => {
    expect(normalizeBasePath("registry")).toBe("/registry");
    expect(normalizeBasePath("/registry")).toBe("/registry");
  });

  it("strips trailing slashes", () => {
    expect(normalizeBasePath("/registry/")).toBe("/registry");
    expect(normalizeBasePath("/registry//")).toBe("/registry");
  });

  it("keeps nested base paths intact", () => {
    expect(normalizeBasePath("/tools/registry")).toBe("/tools/registry");
  });
});
