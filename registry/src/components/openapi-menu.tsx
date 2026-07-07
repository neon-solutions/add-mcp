"use client";

import { Copy, ExternalLink, FileJson } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { withBasePath } from "@/lib/base-path";

const OPENAPI_URL = withBasePath("/api/openapi.json");

export function OpenApiMenu() {
  async function handleCopyContent() {
    try {
      const res = await fetch(OPENAPI_URL);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      toast.success("OpenAPI spec copied to clipboard");
    } catch {
      toast.error("Failed to copy OpenAPI spec");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1.5">
          <FileJson className="size-4" />
          <span className="hidden sm:inline">OpenAPI</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={OPENAPI_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleCopyContent()}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Content
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
