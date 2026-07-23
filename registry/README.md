# add-mcp registry

The registry API & UI behind [add-mcp.com/registry](https://add-mcp.com/registry) — a read-only MCP registry following the [official MCP registry specification](https://github.com/modelcontextprotocol/registry), serving a cached snapshot of the integrations.sh MCP servers ranked by searches.

It also serves the legacy domain [mcp.agent-tooling.dev](https://mcp.agent-tooling.dev/), where all old root-relative URLs keep working.

Forked from the generic [agent-tooling/mcp-registry](https://github.com/agent-tooling/mcp-registry) server and rebranded for add-mcp.

## Architecture

- **Next.js** app with a React Server Component UI and a [Hono](https://hono.dev/) API mounted at `/api`
- **Registry source** is a JSON file (local path or URL) matching the MCP registry schema — production reads `registry.json` from this repository's `main` branch
- **API** provides search, cursor pagination, and an OpenAPI spec at `/api/openapi.json`
- **UI** uses shadcn/ui with dark mode via next-themes and instant search via nuqs
- **Analytics** optionally records API requests and search terms to Postgres (Neon)

## Development

```bash
pnpm install
cp .env.example .env
pnpm run dev
```

Set `MCP_REGISTRY_SOURCE_PATH` in `.env` to a local JSON file or a raw GitHub URL:

```env
MCP_REGISTRY_SOURCE_PATH=./fixtures/registry.json
```

### Base path

Production serves the registry under `/registry` (proxied from add-mcp.com):

```env
NEXT_PUBLIC_BASE_PATH=/registry
```

All pages, assets, and API routes then live under the base path (`/registry`, `/registry/api/v1/servers`, ...). For backwards compatibility, old root-relative URLs (`/`, `/servers/...`, `/api/v1/servers`, ...) keep working on the deployment's own domain via internal rewrites — no redirects, so existing API clients are unaffected. Leave unset (default) to serve from the domain root.

Other scripts:

```bash
pnpm run typecheck    # type check
pnpm run test         # run tests
pnpm run fmt          # format with prettier
pnpm run fmt:check    # check formatting
```

## Deployment

Deployed on Vercel as the `add-mcp-registry` project (root directory: `registry/`), serving `mcp.agent-tooling.dev` directly and `add-mcp.com/registry` through a proxy rewrite from the website project.

### API Analytics

Set these variables to record API requests and search terms to Postgres:

```env
ENABLE_ANALYTICS=true
DATABASE_URL=postgres://...
ANALYTICS_SALT=replace-with-a-stable-random-secret
```

When enabled, the registry stores request metadata such as method, path, status, duration, search term, search source (`web`, `cli`, or `api`), pagination flags, user agent, referrer, and a salted hash of the client IP address. Raw IP addresses are not stored. Apply the checked-in Drizzle migrations before deploying schema changes.

### Search-based popularity

When `DATABASE_URL` is set, recorded search terms power additional features:

- The default (unfiltered) server listing in the UI and API is sorted by search popularity instead of alphabetically. A search term counts towards every server it matches, and overly generic terms (matching more than 25 servers) are ignored.
- The home page shows combined website, CLI, and API search stats (total searches all time and this week) and trending search terms.
- Server cards show per-server search counts.

Without a database, the registry falls back to alphabetical sorting and hides the analytics UI.
