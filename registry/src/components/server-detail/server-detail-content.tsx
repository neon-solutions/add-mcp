import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitForkIcon,
  ScaleIcon,
  StarIcon,
  TagIcon,
  CircleDotIcon,
} from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { ServerCard } from "@/components/server-card";
import { ServerIcon } from "@/components/server-icon";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GitHubRepoData } from "@/lib/github";
import { displayServerName, publisherFromNamespace } from "@/lib/publisher";
import type { RelatedServer, SearchCount } from "@/lib/registry-service";
import type { ServerEntry } from "@/lib/schema";
import { searchQueryForServerName } from "@/lib/query-servers";
import { ApiAccessCard } from "./api-access-card";
import { DetailsCard } from "./details-card";
import { InstallConfigurator } from "./install-configurator";

type ServerDetailContentProps = {
  entry: ServerEntry;
  searchCount?: SearchCount;
  related: RelatedServer[];
  githubData?: GitHubRepoData | null;
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function GitHubCard({ data }: { data: GitHubRepoData }) {
  return (
    <a href={data.htmlUrl} target="_blank" rel="noreferrer" className="block">
      <Card className="transition-all hover:shadow-md hover:ring-primary/40">
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <GitBranchIcon className="size-4 text-muted-foreground" />
            <span className="font-mono text-sm font-medium">
              {data.fullName}
            </span>
          </div>

          {data.description && (
            <p className="text-sm text-muted-foreground">{data.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <StarIcon className="size-3.5" />
              {formatNumber(data.stars)}
            </span>
            <span className="inline-flex items-center gap-1">
              <GitForkIcon className="size-3.5" />
              {formatNumber(data.forks)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleDotIcon className="size-3.5" />
              {formatNumber(data.openIssues)} issues
            </span>
            {data.language && (
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-full bg-primary" />
                {data.language}
              </span>
            )}
            {data.license && (
              <span className="inline-flex items-center gap-1">
                <ScaleIcon className="size-3.5" />
                {data.license}
              </span>
            )}
          </div>

          {data.latestRelease && (
            <div className="flex items-center gap-1.5 text-xs">
              <TagIcon className="size-3.5 text-muted-foreground" />
              <span className="font-mono">{data.latestRelease.tagName}</span>
              <span className="text-muted-foreground">
                released{" "}
                {formatDistanceToNow(new Date(data.latestRelease.publishedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Updated{" "}
            {formatDistanceToNow(new Date(data.updatedAt), {
              addSuffix: true,
            })}
          </p>
        </CardContent>
      </Card>
    </a>
  );
}

export function ServerDetailContent({
  entry,
  searchCount,
  related,
  githubData,
}: ServerDetailContentProps) {
  const server = entry.server;
  const officialMeta =
    entry._meta?.["io.modelcontextprotocol.registry/official"];
  const namespace = server.name.split("/")[0];
  const publisher = publisherFromNamespace(namespace);
  const hasRemotes = (server.remotes ?? []).length > 0;
  const hasPackages = (server.packages ?? []).length > 0;
  const packageRegistries = [
    ...new Set((server.packages ?? []).map((pkg) => pkg.registryType)),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <Link
        href="/"
        className={buttonVariants({
          variant: "ghost",
          className: "mb-6 gap-1.5 pl-2 text-muted-foreground",
        })}
      >
        <ArrowLeftIcon className="size-4" />
        Back to registry
      </Link>

      <div className="space-y-3">
        <div className="flex items-start gap-4">
          <ServerIcon
            icons={server.icons}
            title={server.title ?? server.name}
            size="lg"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                {server.title ?? server.name}
              </h1>
              <Badge variant="secondary" className="shrink-0 font-mono">
                v{server.version}
              </Badge>
              {officialMeta?.status && officialMeta.status !== "active" ? (
                <Badge variant="destructive" className="shrink-0 capitalize">
                  {officialMeta.status}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <p
                className="font-mono text-sm break-all text-muted-foreground"
                title={`Registry ID: ${server.name}`}
              >
                {displayServerName(server.name)}
              </p>
              <CopyButton text={server.name} label="Copy registry ID" />
            </div>
          </div>
        </div>
        <p className="max-w-3xl text-muted-foreground">{server.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          {server.websiteUrl && (
            <a
              href={server.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
              })}
            >
              <ExternalLinkIcon className="size-3" />
              Website
            </a>
          )}
          {!githubData && server.repository?.url && (
            <a
              href={server.repository.url}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
              })}
            >
              <GitBranchIcon className="size-3" />
              Repository
            </a>
          )}
        </div>
      </div>

      <hr className="my-8 border-border" />

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-10">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Install with add-mcp</h2>
            <p className="text-sm text-muted-foreground">
              Configure your installation and copy the command below. Uses{" "}
              <a
                href="https://github.com/neondatabase/add-mcp"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                add-mcp
              </a>{" "}
              to install the server into your agent of choice.
            </p>
            <InstallConfigurator
              packages={server.packages}
              remotes={server.remotes}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">API access</h2>
            <ApiAccessCard
              searchQuery={searchQueryForServerName(server.name)}
            />
          </section>
        </div>

        <aside className="w-full shrink-0 space-y-6 lg:w-80">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Details</h2>
            <DetailsCard
              publisher={publisher}
              version={server.version}
              officialMeta={officialMeta}
              hasRemotes={hasRemotes}
              hasPackages={hasPackages}
              packageRegistries={packageRegistries}
              searchCount={searchCount}
            />
          </section>

          {githubData && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Repository</h2>
              <GitHubCard data={githubData} />
            </section>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2 className="text-lg font-semibold">More from {publisher.label}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {related.map((item) => (
              <ServerCard
                key={item.entry.server.name}
                entry={item.entry}
                searchCount={item.searchCount}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
