import { withBasePath } from "@/lib/base-path";
import { BRAND } from "@/lib/brand";

const linkClass = "hover:text-foreground transition-colors";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
        <div className="flex flex-col items-center gap-1.5 md:items-start">
          <p>add-mcp — Apache-2.0, free and open source.</p>
          <p className="text-xs">
            Made by{" "}
            <a
              href={BRAND.authorUrl}
              className={`${linkClass} underline underline-offset-4`}
            >
              {BRAND.authorName}
            </a>{" "}
            · Docs powered by{" "}
            <a
              href={BRAND.blumeUrl}
              className={`${linkClass} underline underline-offset-4`}
            >
              Blume
            </a>
          </p>
        </div>
        <nav className="flex items-center gap-4">
          <a href={BRAND.docsUrl} className={linkClass}>
            Docs
          </a>
          <a href={BRAND.registryUrl} className={linkClass}>
            Registry
          </a>
          <a
            href={withBasePath("/api/openapi.json")}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            API
          </a>
          <a
            href={BRAND.githubUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            GitHub
          </a>
          <a
            href={BRAND.npmUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            npm
          </a>
        </nav>
      </div>
    </footer>
  );
}
