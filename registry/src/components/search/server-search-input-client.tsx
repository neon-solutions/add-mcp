"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { debounce, parseAsInteger, parseAsString, useQueryState } from "nuqs";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ServerSearchInputClientProps = {
  placeholder?: string;
  className?: string;
};

export function ServerSearchInputClient({
  placeholder = "Search servers, e.g. github, postgres, linear…",
  className,
}: ServerSearchInputClientProps) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      history: "replace",
      shallow: false,
      startTransition,
      limitUrlUpdates: debounce(250),
    }),
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(0).withOptions({
      history: "replace",
      shallow: false,
      startTransition,
    }),
  );
  // Local state keeps typing responsive; the query state (and server
  // round-trip) follows debounced behind it.
  const [value, setValue] = useState(search);

  function handleChange(next: string) {
    setValue(next);
    void setSearch(next || null);
    void setPage(null);
  }

  // Sync back when the search param changes elsewhere (e.g. trending chips).
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setValue(search);
  }

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search servers"
        className="h-11 rounded-xl pl-10 text-base shadow-sm [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
        {isPending ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : null}
        {value ? (
          <button
            type="button"
            onClick={() => handleChange("")}
            aria-label="Clear search"
            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
