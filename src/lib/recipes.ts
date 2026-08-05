import { createClient } from "@/lib/supabase/server";
import type { RecipeInstructionStep } from "@/lib/supabase/types";

export const RECIPES_PAGE_SIZE = 24;

export type RecipeSummary = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  totalMinutes: number | null;
};

export type RecipeIngredientDetail = {
  id: string;
  rawText: string;
};

export type RecipeDetail = RecipeSummary & {
  servings: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  instructions: RecipeInstructionStep[];
  ingredients: RecipeIngredientDetail[];
};

// Prefer the French translation; fall back to the original text while it's
// still pending (translation runs as a separate pass from scraping).
function localize<T>(translated: T | null, original: T): T {
  return translated ?? original;
}

async function imageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imagePath: string | null,
) {
  if (!imagePath) return null;
  return supabase.storage.from("recipe-images").getPublicUrl(imagePath).data
    .publicUrl;
}

export async function listRecipes(page: number) {
  const supabase = await createClient();
  const from = (page - 1) * RECIPES_PAGE_SIZE;
  const to = from + RECIPES_PAGE_SIZE - 1;

  const { data, count, error } = await supabase
    .from("recipes")
    .select("id, title, title_fr, description, description_fr, image_path, total_minutes", {
      count: "exact",
    })
    .order("title")
    .range(from, to);

  if (error) throw error;

  const recipes: RecipeSummary[] = await Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      title: localize(row.title_fr, row.title),
      description: localize(row.description_fr, row.description),
      imageUrl: await imageUrl(supabase, row.image_path),
      totalMinutes: row.total_minutes,
    })),
  );

  return { recipes, count: count ?? 0 };
}

export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const supabase = await createClient();

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select(
      "id, title, title_fr, description, description_fr, image_path, servings, prep_minutes, cook_minutes, total_minutes, instructions, instructions_fr",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!recipe) return null;

  const { data: recipeIngredients, error: ingredientsError } = await supabase
    .from("recipe_ingredients")
    .select("id, raw_text, display_order")
    .eq("recipe_id", id)
    .order("display_order");

  if (ingredientsError) throw ingredientsError;

  return {
    id: recipe.id,
    title: localize(recipe.title_fr, recipe.title),
    description: localize(recipe.description_fr, recipe.description),
    imageUrl: await imageUrl(supabase, recipe.image_path),
    totalMinutes: recipe.total_minutes,
    servings: recipe.servings,
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
    instructions: localize(recipe.instructions_fr, recipe.instructions),
    ingredients: (recipeIngredients ?? []).map((row) => ({
      id: row.id,
      rawText: row.raw_text,
    })),
  };
}
