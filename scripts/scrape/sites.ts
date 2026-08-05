export interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  postSitemaps: string[];
}

export const SITES: SiteConfig[] = [
  {
    id: "justonecookbook",
    name: "Just One Cookbook",
    baseUrl: "https://www.justonecookbook.com",
    postSitemaps: [
      "https://www.justonecookbook.com/post-sitemap.xml",
      "https://www.justonecookbook.com/post-sitemap2.xml",
    ],
  },
  {
    id: "koreanbapsang",
    name: "Korean Bapsang",
    baseUrl: "https://www.koreanbapsang.com",
    postSitemaps: ["https://www.koreanbapsang.com/post-sitemap.xml"],
  },
];

export function getSite(id: string): SiteConfig {
  const site = SITES.find((s) => s.id === id);
  if (!site) {
    throw new Error(
      `Unknown site "${id}". Valid ids: ${SITES.map((s) => s.id).join(", ")}`,
    );
  }
  return site;
}

// A browser-like UA avoids Cloudflare challenge pages that a generic
// "Mozilla/5.0" (no browser/engine tokens) can trigger on some routes.
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
