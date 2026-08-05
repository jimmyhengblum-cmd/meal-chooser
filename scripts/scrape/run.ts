import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { SITES, getSite } from "./sites";
import { listRecipeUrls } from "./sitemap";
import { fetchExtractedRecipe } from "./extract";
import { parseIngredientLine } from "./parseIngredient";
import { downloadAndStoreImage } from "./image";
import { getScrapedUrls, insertRecipe, insertRecipeIngredients } from "./db";
import { createAdminClient } from "./supabaseAdmin";

interface Args {
  site: string;
  limit: number | null;
  dryRun: boolean;
  delayMs: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string) =>
    args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];

  return {
    site: get("site") ?? "all",
    limit: get("limit") ? parseInt(get("limit")!, 10) : null,
    dryRun: args.includes("--dry-run"),
    delayMs: get("delay-ms") ? parseInt(get("delay-ms")!, 10) : 1500,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeSite(
  siteId: string,
  args: Args,
  admin: ReturnType<typeof createAdminClient> | null,
) {
  const site = getSite(siteId);
  console.log(`\n=== ${site.name} ===`);

  let urls = await listRecipeUrls(site);
  console.log(`found ${urls.length} candidate post URLs`);

  if (admin) {
    const alreadyScraped = await getScrapedUrls(admin, site.id);
    const before = urls.length;
    urls = urls.filter((url) => !alreadyScraped.has(url));
    console.log(
      `${before - urls.length} already scraped, ${urls.length} remaining to try`,
    );
  }

  if (args.limit) urls = urls.slice(0, args.limit);

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, url] of urls.entries()) {
    process.stdout.write(`[${i + 1}/${urls.length}] ${url} ... `);
    try {
      const extracted = await fetchExtractedRecipe(url);
      if (!extracted) {
        console.log("skipped (no Recipe data)");
        skipped++;
        continue;
      }

      if (args.dryRun) {
        console.log(`OK (dry-run) "${extracted.title}"`);
        saved++;
        continue;
      }

      const imagePath = await downloadAndStoreImage(
        admin!,
        site.id,
        extracted.sourceUrl,
        extracted.imageUrl,
      );
      const recipeId = await insertRecipe(admin!, site.id, extracted, imagePath);
      const ingredients = extracted.ingredientLines.map((rawText) => ({
        rawText,
        ...parseIngredientLine(rawText),
      }));
      await insertRecipeIngredients(admin!, recipeId, ingredients);

      console.log(`saved "${extracted.title}"`);
      saved++;
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
      failed++;
    }
    await sleep(args.delayMs);
  }

  console.log(`${site.name}: ${saved} saved, ${skipped} skipped, ${failed} failed`);
}

async function main() {
  const args = parseArgs();
  const siteIds = args.site === "all" ? SITES.map((s) => s.id) : [args.site];

  const admin = args.dryRun ? null : createAdminClient();

  for (const siteId of siteIds) {
    await scrapeSite(siteId, args, admin);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
