import Link from "next/link";

import { HeaderBadges } from "@/components/brand/header-badges";
import { LogoMark } from "@/components/brand/logo-mark";
import { ThemeSelector } from "@/components/themes/selector";
import { BRAND } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur md:px-6">
      <Link
        href={BRAND.siteUrl}
        className="inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight"
      >
        <LogoMark className="size-5 shrink-0" />
        <span className="truncate text-sm md:text-base">{BRAND.name}</span>
      </Link>

      <nav
        aria-label="Site"
        className="hidden items-center gap-1 text-sm md:flex"
      >
        <a
          href={BRAND.docsUrl}
          className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Docs
        </a>
        <span
          aria-current="page"
          className="rounded-full px-3 py-1.5 font-medium text-foreground"
        >
          Registry
        </span>
      </nav>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1.5">
        <HeaderBadges />
        <ThemeSelector />
      </div>
    </header>
  );
}
