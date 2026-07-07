"use client";

import { useEffect, useState } from "react";
import { CodeIcon } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Card, CardContent } from "@/components/ui/card";
import { withBasePath } from "@/lib/base-path";

type ApiAccessCardProps = {
  /** Search query that resolves this server through the API. */
  searchQuery: string;
};

export function ApiAccessCard({ searchQuery }: ApiAccessCardProps) {
  // The registry is self-hosted, so the public base URL is only known in the
  // browser. Fall back to a relative path during SSR/prerender.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}${withBasePath("/api/v1/servers")}?search=${encodeURIComponent(searchQuery)}`;
  const command = `curl "${url}"`;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CodeIcon className="size-4 text-muted-foreground" />
          Access via API
        </div>
        <p className="text-sm text-muted-foreground">
          Fetch this server&apos;s registry entry as JSON. See the{" "}
          <a
            href={withBasePath("/api/openapi.json")}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            OpenAPI spec
          </a>{" "}
          for all endpoints.
        </p>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <code className="flex-1 overflow-x-auto font-mono text-sm break-all">
            {command}
          </code>
          <CopyButton text={command} label="Copy API command" />
        </div>
      </CardContent>
    </Card>
  );
}
