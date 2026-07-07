import { BRAND } from "./brand";

export type SiteConfig = {
  name: string;
  description: string;
  repositoryUrl: string;
};

export function getSiteConfig(): SiteConfig {
  return {
    name: BRAND.registryName,
    description: BRAND.description,
    repositoryUrl: BRAND.githubUrl,
  };
}
