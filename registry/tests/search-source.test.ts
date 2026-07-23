import { describe, expect, it } from "vitest";

import { apiSearchSource } from "../src/lib/analytics/search-source";

describe("apiSearchSource", () => {
  it("identifies add-mcp CLI searches", () => {
    expect(apiSearchSource("cli")).toBe("cli");
  });

  it("keeps missing and untrusted sources in the generic API bucket", () => {
    expect(apiSearchSource(undefined)).toBe("api");
    expect(apiSearchSource("web")).toBe("api");
    expect(apiSearchSource("other")).toBe("api");
  });
});
