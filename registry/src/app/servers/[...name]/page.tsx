import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ServerDetailContent } from "@/components/server-detail/server-detail-content";
import { fetchGitHubRepoData } from "@/lib/github";
import { loadRegistryFromFile } from "@/lib/load-registry";
import {
  getServerByName,
  getServerPageData,
  getSourcePath,
} from "@/lib/registry-service";

export const revalidate = 60;

export async function generateStaticParams() {
  const entries = await loadRegistryFromFile(getSourcePath());
  return entries.map((entry) => ({
    name: entry.server.name.split("/"),
  }));
}

type PageProps = {
  params: Promise<{ name: string[] }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { name } = await params;
  const serverName = name.join("/");
  const entry = await getServerByName(serverName);

  if (!entry) {
    return { title: "Server not found" };
  }

  const title = entry.server.title ?? entry.server.name;
  const description = entry.server.description;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function ServerDetailPage({ params }: PageProps) {
  const { name } = await params;
  const serverName = name.join("/");
  const pageData = await getServerPageData(serverName);

  if (!pageData) {
    notFound();
  }

  const server = pageData.entry.server;
  const githubData = server.repository?.url
    ? await fetchGitHubRepoData(server.repository.url)
    : null;

  return (
    <div>
      <ServerDetailContent
        entry={pageData.entry}
        searchCount={pageData.searchCount}
        related={pageData.related}
        githubData={githubData}
      />
    </div>
  );
}
