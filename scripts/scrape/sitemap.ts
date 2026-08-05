import { USER_AGENT, type SiteConfig } from "./sites";
import { httpGetText } from "./httpClient";

const fetchText = (url: string) => httpGetText(url, { "User-Agent": USER_AGENT });

// Pages that are clearly not individual recipe posts (tag/category index
// pages, "roundup" listicles) that show up in WordPress post sitemaps.
const NON_RECIPE_PATH_HINTS = [
  "/category/",
  "/tag/",
  "/recipes/",
  "/about",
  "/contact",
  "/privacy",
];

export async function listRecipeUrls(site: SiteConfig): Promise<string[]> {
  const urls = new Set<string>();
  for (const sitemapUrl of site.postSitemaps) {
    const xml = await fetchText(sitemapUrl);
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of matches) {
      const url = m[1].trim();
      if (NON_RECIPE_PATH_HINTS.some((hint) => url.includes(hint))) continue;
      urls.add(url);
    }
  }
  return [...urls];
}
