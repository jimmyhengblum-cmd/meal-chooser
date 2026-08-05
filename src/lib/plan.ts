import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, type MealSlot } from "@/lib/week";

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
