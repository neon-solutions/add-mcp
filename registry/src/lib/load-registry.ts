import { readFile } from "node:fs/promises";

import { ZodError } from "zod";

import { sourceRegistrySchema, type ServerEntry } from "./schema";

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

async function fetchContent(source: string): Promise<string> {
  if (isUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch registry from ${source}: ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }
  return readFile(source, "utf8");
}

export async function loadRegistryFromFile(
  sourcePath: string,
): Promise<ServerEntry[]> {
  const rawContent = await fetchContent(sourcePath);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new Error(
      `Invalid JSON in MCP registry source file at ${sourcePath}: ${detail}`,
    );
  }

  const result = sourceRegistrySchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `Invalid MCP registry structure in ${sourcePath}: ${formatZodError(result.error)}`,
    );
  }

  return result.data;
}
