import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, weekDates, type MealSlot } from "@/lib/week";

export type PlanEntry = {
  id: string;
  plannedDate: string;
  mealSlot: string;
  recipe: { id: string; title: string; imageUrl: string | null };
};

export async function getWeekPlan(weekStart: Date): Promise<PlanEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id, planned_date, meal_slot, recipes(id, title, title_fr, image_path)")
    .gte("planned_date", formatDate(weekStart))
    .lte("planned_date", formatDate(addDays(weekStart, 6)));

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.recipes)
    .map((row) => ({
      id: row.id,
      plannedDate: row.planned_date,
      mealSlot: row.meal_slot,
      recipe: {
        id: row.recipes!.id,
        title: row.recipes!.title_fr ?? row.recipes!.title,
        imageUrl: row.recipes!.image_path
          ? supabase.storage
              .from("recipe-images")
              .getPublicUrl(row.recipes!.image_path).data.publicUrl
          : null,
      },
    }));
}

export async function assignRecipeToPlan(
  plannedDate: string,
  mealSlot: MealSlot,
  recipeId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // At most one recipe per day/slot: clear any existing entry first.
  await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("planned_date", plannedDate)
    .eq("meal_slot", mealSlot);

  const { error } = await supabase.from("meal_plan_entries").insert({
    user_id: user.id,
    recipe_id: recipeId,
    planned_date: plannedDate,
    meal_slot: mealSlot,
  });

  if (error) throw error;
}

export async function removePlanEntry(entryId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId);

  if (error) throw error;
}

// Prep/cook time and servings don't reliably separate real dishes from
// condiments, drinks, spice mixes, and how-to techniques scraped alongside
// them: e.g. "Croquette Sandwich" (5 min, servings 2) is a real meal while
// "Homemade Japanese Curry Powder" (5 min, servings 6) isn't, and "Gyoza"
// legitimately yields 52 (pieces, not people). Title-based filtering works
// better, but a plain keyword search over the whole title is too blunt —
// "Grilled Oysters with Ponzu Sauce" or "Kimchi Jjigae (Kimchi Stew)" are
// full dishes whose *name* happens to mention a sauce/kimchi ingredient.
// So: a dish-type word (stew, rice, grilled, ...) or " with " anywhere
// always wins (it's describing a real dish); only titles that are just a
// short, bare condiment/drink/kimchi-variety name — nothing else — are
// treated as not-a-meal. "How to ..." titles are technique articles, not
// recipes, and are always excluded.
const HOW_TO_PATTERN = /how to/i;
const DISH_TYPE_OVERRIDE =
  /\b(stir-fry|stir fry|stew|soup|curry|noodles?|ramen|salad|sandwich|bento|pancakes?|dumplings?|gyoza|casserole|hot ?pot|bibimbap|bulgogi|jjigae|jjim|guksu|bokkeum|jorim|muchim|nabe|donburi|katsu|tempura|yakitori|teriyaki|karaage|grilled?|roast(ed)?|braised|steak|chops?|wings?|skewers?|kebab|taco|burger|pizza|pasta|spaghetti|omelette|tamagoyaki|sukiyaki|shabu|bowl|platter|fried rice|fried chicken|rice)\b/i;
const NON_MEAL_WORDS = new Set([
  "sauce", "syrup", "dressing", "dip", "dipping", "ponzu", "marinade",
  "paste", "powder", "dashi", "broth", "stock", "smoothie", "latte", "tea",
  "coffee", "milk", "mayo", "eggnog", "kimchi",
]);

function isLikelyFullMeal(title: string): boolean {
  if (HOW_TO_PATTERN.test(title)) return false;
  if (DISH_TYPE_OVERRIDE.test(title)) return true;
  if (/ with /i.test(title)) return true;
  const words = title
    .replace(/[()]/g, " ")
    .split(/[\s\-–—]+/)
    .filter(Boolean);
  if (words.length > 7) return true;
  const lastWord = words[words.length - 1]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/s$/, "");
  return !(lastWord && NON_MEAL_WORDS.has(lastWord));
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Fills empty lunch/dinner slots for the week with random recipes, avoiding
// repeats within the week where the catalog is large enough to do so.
// Breakfast and already-filled slots are left untouched.
export async function generateWeekPlan(weekStart: Date) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const days = weekDates(weekStart).map(formatDate);
  const slots: MealSlot[] = ["lunch", "dinner"];

  const { data: existing, error: existingError } = await supabase
    .from("meal_plan_entries")
    .select("planned_date, meal_slot, recipe_id")
    .in("planned_date", days)
    .in("meal_slot", slots);
  if (existingError) throw existingError;

  const filledSlots = new Set(
    (existing ?? []).map((e) => `${e.planned_date}::${e.meal_slot}`),
  );
  const usedRecipeIds = new Set((existing ?? []).map((e) => e.recipe_id));

  const emptySlots = days.flatMap((date) =>
    slots
      .filter((slot) => !filledSlots.has(`${date}::${slot}`))
      .map((slot) => ({ date, slot })),
  );
  if (emptySlots.length === 0) return;

  const { data: recipes, error: recipesError } = await supabase
    .from("recipes")
    .select("id, title");
  if (recipesError) throw recipesError;

  const mealIds = (recipes ?? [])
    .filter((r) => isLikelyFullMeal(r.title))
    .map((r) => r.id);
  // Fall back to the full catalog if the meal-only filter leaves too little
  // to fill the week, rather than silently doing nothing.
  const allIds =
    mealIds.length >= emptySlots.length
      ? mealIds
      : (recipes ?? []).map((r) => r.id);

  const unused = shuffle(allIds.filter((id) => !usedRecipeIds.has(id)));
  const pool = unused.length >= emptySlots.length ? unused : shuffle(allIds);
  if (pool.length === 0) return;

  const rows = emptySlots.map((slot, i) => ({
    user_id: user.id,
    recipe_id: pool[i % pool.length],
    planned_date: slot.date,
    meal_slot: slot.slot,
  }));

  const { error } = await supabase.from("meal_plan_entries").insert(rows);
  if (error) throw error;
}
