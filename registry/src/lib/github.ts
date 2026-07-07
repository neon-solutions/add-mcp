export type GitHubRepoData = {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  license: string | null;
  updatedAt: string;
  htmlUrl: string;
  latestRelease: {
    tagName: string;
    publishedAt: string;
    htmlUrl: string;
  } | null;
};

function parseGitHubOwnerRepo(
  url: string,
): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export async function fetchGitHubRepoData(
  repositoryUrl: string,
): Promise<GitHubRepoData | null> {
  const parsed = parseGitHubOwnerRepo(repositoryUrl);
  if (!parsed) return null;

  const { owner, repo } = parsed;
  const headers: HeadersInit = { Accept: "application/vnd.github.v3+json" };

  try {
    const repoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers, next: { revalidate: 3600 } },
    );
    if (!repoRes.ok) return null;

    const repoData = await repoRes.json();

    let latestRelease: GitHubRepoData["latestRelease"] = null;
    try {
      const releaseRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        { headers, next: { revalidate: 3600 } },
      );
      if (releaseRes.ok) {
        const releaseData = await releaseRes.json();
        latestRelease = {
          tagName: releaseData.tag_name,
          publishedAt: releaseData.published_at,
          htmlUrl: releaseData.html_url,
        };
      }
    } catch {
      // no release available
    }

    return {
      fullName: repoData.full_name,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      language: repoData.language,
      license: repoData.license?.spdx_id ?? null,
      updatedAt: repoData.updated_at,
      htmlUrl: repoData.html_url,
      latestRelease,
    };
  } catch {
    return null;
  }
}
