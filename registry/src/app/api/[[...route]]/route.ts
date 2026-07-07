import { handle } from "hono/vercel";
import { apiApp } from "@/lib/api-app";

export const runtime = "nodejs";

export const GET = handle(apiApp);
export const POST = handle(apiApp);
export const PUT = handle(apiApp);
export const PATCH = handle(apiApp);
export const DELETE = handle(apiApp);
export const OPTIONS = handle(apiApp);
export const HEAD = handle(apiApp);
