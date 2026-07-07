"use client";

import { Suspense } from "react";
import { TrendingUpIcon } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import { Badge } from "@/components/ui/badge";

type TrendingSearchesProps = {
  terms: string[];
};

function TrendingSearchesClient({ terms }: TrendingSearchesProps) {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString
      .withDefault("")
      .withOptions({ history: "replace", shallow: false }),
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger
      .withDefault(0)
      .withOptions({ history: "replace", shallow: false }),
  );

  if (terms.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <TrendingUpIcon className="size-3.5" />
        Trending:
      </span>
      {terms.map((term) => {
        const isActive = search === term;
        return (
          <button
            key={term}
            type="button"
            onClick={() => {
              void setSearch(isActive ? null : term);
              void setPage(null);
            }}
            className="cursor-pointer outline-none"
          >
            <Badge
              variant={isActive ? "default" : "outline"}
              className="pointer-events-none"
            >
              {term}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

export function TrendingSearches({ terms }: TrendingSearchesProps) {
  if (terms.length === 0) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <TrendingSearchesClient terms={terms} />
    </Suspense>
  );
}
