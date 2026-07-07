import Link from "next/link";

import { OpenApiMenu } from "@/components/openapi-menu";
import { ThemeSelector } from "@/components/themes/selector";
import { buttonVariants } from "@/components/ui/button";
import { getSiteConfig } from "@/lib/site-config";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

// Monochrome tile + slash drawn with theme colors, so the default mark stays
// black-and-white in light mode and inverts in dark mode.
function DefaultLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" className="fill-foreground" />
      <path
        d="M25 46 39 18"
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        className="stroke-background"
      />
    </svg>
  );
}

export function SiteHeader() {
  const site = getSiteConfig();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight"
        >
          {site.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed
            <img
              src={site.logoUrl}
              alt=""
              aria-hidden
              className="size-6 shrink-0 rounded-md"
            />
          ) : (
            <DefaultLogoMark className="size-6 shrink-0" />
          )}
          <span className="truncate text-sm md:text-base">{site.name}</span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <OpenApiMenu />
          {site.repositoryUrl ? (
            <a
              href={site.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Registry repository on GitHub"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <GitHubMark className="size-4" />
            </a>
          ) : null}
          <ThemeSelector />
        </div>
      </div>
    </header>
  );
}
