import { defineConfig } from "blume";

export default defineConfig({
  title: "add-mcp",
  description:
    "Add MCP servers to your favorite coding agents with a single command.",

  content: {
    root: "content",
  },

  theme: {
    accent: "teal",
    radius: "md",
    mode: "system",
  },

  ai: {
    llmsTxt: true,
  },

  seo: {
    og: { enabled: true },
    sitemap: true,
    robots: true,
    structuredData: true,
  },

  deployment: {
    output: "static",
    site: "https://add-mcp.com",
  },
});
