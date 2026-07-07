import { format } from "date-fns";
import {
  BoxIcon,
  CalendarIcon,
  GlobeIcon,
  RefreshCwIcon,
  SearchIcon,
  TagIcon,
  TerminalIcon,
  UserIcon,
} from "lucide-react";

import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Publisher } from "@/lib/publisher";
import type { SearchCount } from "@/lib/registry-service";

export type OfficialMeta = {
  status?: string;
  publishedAt?: string;
  updatedAt?: string;
};

export type DetailsCardProps = {
  publisher: Publisher;
  version: string;
  officialMeta?: OfficialMeta;
  hasRemotes: boolean;
  hasPackages: boolean;
  packageRegistries: string[];
  searchCount?: SearchCount;
};

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return format(date, "MMM d, yyyy");
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

export function DetailsCard({
  publisher,
  version,
  officialMeta,
  hasRemotes,
  hasPackages,
  packageRegistries,
  searchCount,
}: DetailsCardProps) {
  const publishedAt = officialMeta?.publishedAt
    ? formatDate(officialMeta.publishedAt)
    : null;
  const updatedAt = officialMeta?.updatedAt
    ? formatDate(officialMeta.updatedAt)
    : null;

  return (
    <Card>
      <CardContent>
        <dl className="space-y-2.5">
          <DetailRow icon={<UserIcon className="size-3.5" />} label="Publisher">
            {publisher.url ? (
              <a
                href={publisher.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate underline-offset-4 hover:underline"
              >
                {publisher.label}
              </a>
            ) : (
              <span className="block truncate">{publisher.label}</span>
            )}
          </DetailRow>

          <DetailRow icon={<TagIcon className="size-3.5" />} label="Version">
            <span className="font-mono text-xs">v{version}</span>
          </DetailRow>

          {officialMeta?.status ? (
            <DetailRow icon={<BoxIcon className="size-3.5" />} label="Status">
              <Badge
                variant={
                  officialMeta.status === "active" ? "secondary" : "destructive"
                }
                className="capitalize"
              >
                {officialMeta.status}
              </Badge>
            </DetailRow>
          ) : null}

          {(hasRemotes || hasPackages) && (
            <DetailRow
              icon={
                hasRemotes ? (
                  <GlobeIcon className="size-3.5" />
                ) : (
                  <TerminalIcon className="size-3.5" />
                )
              }
              label="Transport"
            >
              <span className="flex flex-wrap justify-end gap-1">
                {hasRemotes ? <Badge variant="outline">remote</Badge> : null}
                {hasPackages ? <Badge variant="outline">stdio</Badge> : null}
              </span>
            </DetailRow>
          )}

          {packageRegistries.length > 0 && (
            <DetailRow icon={<BoxIcon className="size-3.5" />} label="Packages">
              <span className="flex flex-wrap justify-end gap-1">
                {packageRegistries.map((registry) => (
                  <Badge key={registry} variant="outline">
                    {registry}
                  </Badge>
                ))}
              </span>
            </DetailRow>
          )}

          {publishedAt ? (
            <DetailRow
              icon={<CalendarIcon className="size-3.5" />}
              label="Published"
            >
              {publishedAt}
            </DetailRow>
          ) : null}

          {updatedAt ? (
            <DetailRow
              icon={<RefreshCwIcon className="size-3.5" />}
              label="Updated"
            >
              {updatedAt}
            </DetailRow>
          ) : null}
        </dl>

        {searchCount && searchCount.allTime > 0 ? (
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <SearchIcon className="size-3.5" />
                Searches
              </span>
              <span className="font-medium tabular-nums">
                {formatCount(searchCount.allTime)} all time
              </span>
            </div>
            {searchCount.daily && searchCount.daily.length > 1 ? (
              <Sparkline data={searchCount.daily} className="h-9 w-full" />
            ) : null}
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Last {searchCount.daily?.length ?? 30} days</span>
              <span className="tabular-nums">
                {formatCount(searchCount.thisWeek)} this week
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
