import { withBasePath } from "@/lib/base-path";
import { getSiteConfig } from "@/lib/site-config";

const PROJECT_URL = "https://github.com/agent-tooling/mcp-registry";

export function SiteFooter() {
  const site = getSiteConfig();

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground md:h-16 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-0">
        <p>
          Powered by{" "}
          <a
            href={PROJECT_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4 hover:text-foreground"
          >
            mcp-registry
          </a>
          , a self-hostable MCP registry server.
        </p>
        <nav className="flex items-center gap-4">
          <a
            href={withBasePath("/api/openapi.json")}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            API
          </a>
          {site.repositoryUrl ? (
            <a
              href={site.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
