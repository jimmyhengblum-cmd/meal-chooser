import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/types";
import type { ExtractedRecipe } from "./extract";
import type { ParsedIngredientLine } from "./parseIngredient";

type Admin = SupabaseClient<Database>;

// Every source_url already saved for a site, so the scraper can skip
// re-fetching/re-inserting them on a rerun instead of crawling everything
// from scratch.
export async function getScrapedUrls(admin: Admin, siteId: string): Promise<Set<string>> {
  const urls = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("recipes")
      .select("source_url")
      .eq("source_site", siteId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`list recipes failed: ${error.message}`);
    for (const row of data ?? []) urls.add(row.source_url);
    if (!data || data.length < pageSize) break;
  }
  return urls;
}

// Scrape-time insert only — translation fields are left null and filled in
// later by `npm run translate`, which is why this is a plain insert (not an
// upsert): the caller has already filtered out URLs whose source_url is
// already in the table, so a conflict here would mean a bug upstream, not a
// legitimate rescrape to reconcile.
export async function insertRecipe(
  admin: Admin,
  siteId: string,
  extracted: ExtractedRecipe,
  imagePath: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("recipes")
    .insert({
      source_site: siteId,
      source_url: extracted.sourceUrl,
      title: extracted.title,
      description: extracted.description,
      author: extracted.author,
      image_path: imagePath,
      servings: extracted.servings,
      prep_minutes: extracted.prepMinutes,
      cook_minutes: extracted.cookMinutes,
      total_minutes: extracted.totalMinutes,
      instructions: extracted.instructions,
    })
    .select("id")
    .single();

  if (error) throw new Error(`insert recipes failed: ${error.message}`);
  return data.id;
}

// Ingredient names aren't canonicalized across recipes beyond a
// case-insensitive exact match (each recipe is parsed independently, so e.g.
// "egg" vs "eggs" can still end up as separate rows). Good enough for v1; a
// cross-recipe canonicalization pass would be needed to fully dedupe for
// grocery-list aggregation. `name_fr` is intentionally not touched here —
// that's the translate pass's job (see translate-pending.ts) — so a rerun of
// the scraper never overwrites an already-translated ingredient with null.
async function findOrCreateIngredient(admin: Admin, name: string): Promise<string> {
  const { data: existing, error: findError } = await admin
    .from("ingredients")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(`lookup ingredients failed: ${findError.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await admin
    .from("ingredients")
    .insert({ name })
    .select("id")
    .single();
  if (insertError) throw new Error(`insert ingredients failed: ${insertError.message}`);
  return created.id;
}

export interface IngredientLineInput extends ParsedIngredientLine {
  rawText: string;
}

export async function insertRecipeIngredients(
  admin: Admin,
  recipeId: string,
  ingredients: IngredientLineInput[],
): Promise<void> {
  const rows = [];
  for (const [index, ingredient] of ingredients.entries()) {
    const ingredientId = await findOrCreateIngredient(admin, ingredient.name);
    rows.push({
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      raw_text: ingredient.rawText,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      note: ingredient.note,
      display_order: index,
    });
  }

  if (rows.length === 0) return;
  const { error } = await admin.from("recipe_ingredients").insert(rows);
  if (error) throw new Error(`insert recipe_ingredients failed: ${error.message}`);
}
