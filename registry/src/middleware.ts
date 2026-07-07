import { NextResponse, type NextRequest } from "next/server";

import { basePath } from "./lib/base-path";

/**
 * Backwards compatibility when a base path is configured: this registry
 * historically served from the domain root (e.g. /api/v1/servers). Requests
 * outside the base path are internally rewritten into it, so every old URL
 * keeps returning 200s — no redirects, existing API clients are unaffected.
 */
export function middleware(request: NextRequest) {
  if (!basePath) {
    return NextResponse.next();
  }

  // Requests already under the base path are handled by the app directly.
  // `nextUrl.pathname` excludes the base path when the request is under it.
  if (request.nextUrl.basePath === basePath) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `${basePath}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}
