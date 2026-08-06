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
    .select("id");
  if (recipesError) throw recipesError;

  const allIds = (recipes ?? []).map((r) => r.id);
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
