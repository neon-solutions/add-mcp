import type { NextConfig } from "next";
import path from "node:path";

// Kept in sync with src/lib/base-path.ts (next.config cannot import from src).
function normalizeBasePath(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve("."),
  },
  // Backwards-compatible rewrites for old root-relative URLs live in
  // src/middleware.ts (next.config rewrites cannot target the basePath
  // from outside it without an absolute URL).
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
