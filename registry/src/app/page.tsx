import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  ServerIcon as ServerStackIcon,
  TrendingUpIcon,
} from "lucide-react";

import { ServerSearchInput } from "@/components/search/server-search-input";
import { TrendingSearches } from "@/components/search/trending-searches";
import { ServerCard } from "@/components/server-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getTrendingTerms } from "@/lib/analytics/search-stats";
import { getRegistryOverview, listServersByPage } from "@/lib/registry-service";
import { getSiteConfig } from "@/lib/site-config";

export const revalidate = 60;

type SearchParams = {
  search?: string;
  page?: string;
};

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

function safePageIndex(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function buildPageHref(search: string, page: number): string {
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  if (page > 0) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-heading text-lg leading-tight font-semibold tabular-nums">
          {value}
        </p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const search = (params.search ?? "").trim();
  const page = safePageIndex(params.page);

  const site = getSiteConfig();
  const [pageData, overview] = await Promise.all([
    listServersByPage({ search, page }),
    getRegistryOverview(),
  ]);

  const stats = overview.searchStats;
  const trendingTerms = stats ? getTrendingTerms(stats) : [];
  const currentPage = pageData.pageIndex + 1;
  const showPagination = pageData.totalPages > 1;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

        <div className="relative mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
          <div className="mx-auto max-w-2xl space-y-4 text-center">
            <h1 className="text-balance font-heading text-3xl font-bold tracking-tight md:text-5xl">
              {site.name}
            </h1>
            <p className="text-pretty text-base text-muted-foreground md:text-lg">
              {site.description}
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-xl space-y-3">
            <ServerSearchInput />
            <div className="flex justify-center">
              <TrendingSearches terms={trendingTerms} />
            </div>
          </div>

          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            <StatItem
              icon={<ServerStackIcon className="size-4" />}
              label="Servers in registry"
              value={formatCount(overview.totalServers)}
            />
            {stats ? (
              <>
                <StatItem
                  icon={<SearchIcon className="size-4" />}
                  label="Searches all time"
                  value={formatCount(stats.totalAllTime)}
                />
                <StatItem
                  icon={<TrendingUpIcon className="size-4" />}
                  label="Searches this week"
                  value={formatCount(stats.totalThisWeek)}
                />
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* Server list */}
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {search ? (
              <>
                Results for{" "}
                <span className="text-muted-foreground">
                  &ldquo;{search}&rdquo;
                </span>
              </>
            ) : (
              "All servers"
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatCount(pageData.totalCount)}{" "}
            {pageData.totalCount === 1 ? "server" : "servers"}
            {!search && stats
              ? " · sorted by searches"
              : !search
                ? " · sorted alphabetically"
                : ""}
          </p>
        </div>

        {pageData.servers.length === 0 ? (
          <Empty className="border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>
                {search ? "No servers found" : "No servers available"}
              </EmptyTitle>
              <EmptyDescription>
                {search
                  ? `Nothing in this registry matches "${search}". Try a different keyword.`
                  : "This registry does not contain any servers yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pageData.servers.map((entry) => (
              <ServerCard
                key={entry.server.name}
                entry={entry}
                searchCount={pageData.searchCounts[entry.server.name]}
              />
            ))}
          </section>
        )}

        {showPagination ? (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-4 border-t border-border/60 pt-6"
          >
            {pageData.prevPageIndex === undefined ? (
              <span
                aria-disabled
                className={buttonVariants({
                  variant: "outline",
                  className: "pointer-events-none opacity-50",
                })}
              >
                <ChevronLeftIcon className="size-4" />
                Previous
              </span>
            ) : (
              <Link
                href={buildPageHref(search, pageData.prevPageIndex)}
                className={buttonVariants({ variant: "outline" })}
              >
                <ChevronLeftIcon className="size-4" />
                Previous
              </Link>
            )}

            <p className="text-sm text-muted-foreground tabular-nums">
              Page {currentPage} of {pageData.totalPages}
            </p>

            {pageData.nextPageIndex === undefined ? (
              <span
                aria-disabled
                className={buttonVariants({
                  variant: "outline",
                  className: "pointer-events-none opacity-50",
                })}
              >
                Next
                <ChevronRightIcon className="size-4" />
              </span>
            ) : (
              <Link
                href={buildPageHref(search, pageData.nextPageIndex)}
                className={buttonVariants({ variant: "outline" })}
              >
                Next
                <ChevronRightIcon className="size-4" />
              </Link>
            )}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
