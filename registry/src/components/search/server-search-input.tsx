import { Suspense } from "react";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ServerSearchInputClient } from "./server-search-input-client";

type ServerSearchInputProps = {
  placeholder?: string;
  className?: string;
};

export function ServerSearchInput({
  placeholder = "Search servers, e.g. github, postgres, linear…",
  className,
}: ServerSearchInputProps) {
  return (
    <Suspense
      fallback={
        <div className={cn("relative", className)}>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            disabled
            aria-label="Search servers"
            className="h-11 rounded-xl pl-10 text-base shadow-sm"
          />
        </div>
      }
    >
      <ServerSearchInputClient
        placeholder={placeholder}
        className={className}
      />
    </Suspense>
  );
}
