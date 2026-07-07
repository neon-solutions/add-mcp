import Link from "next/link";
import { GlobeIcon, TerminalIcon, TrendingUpIcon } from "lucide-react";

import { ServerIcon } from "@/components/server-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { displayServerName } from "@/lib/publisher";
import type { ServerEntry } from "@/lib/schema";

type SearchCount = {
  allTime: number;
  thisWeek: number;
};

type ServerCardProps = {
  entry: ServerEntry;
  searchCount?: SearchCount;
};

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function ServerCard({ entry, searchCount }: ServerCardProps) {
  const server = entry.server;
  const status =
    entry._meta?.["io.modelcontextprotocol.registry/official"]?.status;
  const hasPackages = (server.packages ?? []).length > 0;
  const hasRemotes = (server.remotes ?? []).length > 0;

  return (
    <Link
      href={`/servers/${server.name}`}
      className="group block h-full outline-none"
    >
      <Card className="h-full gap-3 py-4 transition-all group-hover:ring-primary/40 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader className="gap-0">
          <div className="flex items-start gap-3">
            <ServerIcon
              icons={server.icons}
              title={server.title ?? server.name}
              size="md"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate font-heading text-base leading-snug font-semibold">
                  {server.title ?? server.name}
                </h3>
                {status && status !== "active" ? (
                  <Badge variant="destructive" className="shrink-0 capitalize">
                    {status}
                  </Badge>
                ) : null}
              </div>
              <p
                className="truncate font-mono text-xs text-muted-foreground"
                title={server.name}
              >
                {displayServerName(server.name)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {server.description}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono">
              v{server.version}
            </Badge>
            {hasRemotes ? (
              <Badge variant="outline">
                <GlobeIcon />
                remote
              </Badge>
            ) : null}
            {hasPackages ? (
              <Badge variant="outline">
                <TerminalIcon />
                stdio
              </Badge>
            ) : null}
            {searchCount && searchCount.allTime > 0 ? (
              <span
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
                title={`${formatCount(searchCount.allTime)} searches all time · ${formatCount(searchCount.thisWeek)} this week`}
              >
                <TrendingUpIcon className="size-3.5" />
                {formatCount(searchCount.allTime)}
                {searchCount.thisWeek > 0 ? (
                  <span className="text-muted-foreground/70">
                    · {formatCount(searchCount.thisWeek)} this week
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
