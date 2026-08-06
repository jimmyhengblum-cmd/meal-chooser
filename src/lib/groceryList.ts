import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate } from "@/lib/week";

export type GroceryListLine = {
  id: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
};

// Same ingredient can appear with different units across recipes (e.g. "2
// tsp" from one recipe, "10 ml" from another) — quantities aren't summed
// across units (see generateGroceryListFromWeek), but grouping them under
// one shopping-list entry still keeps the list scannable.
export type GroceryListGroup = {
  ingredientId: string;
  name: string;
  lines: GroceryListLine[];
};

export async function getGroceryList(): Promise<GroceryListGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grocery_list_items")
    .select("id, ingredient_id, quantity, unit, checked, ingredients(name, name_fr)")
    .order("created_at");

  if (error) throw error;

  const groups = new Map<string, GroceryListGroup>();
  for (const row of data ?? []) {
    if (!row.ingredients) continue;
    const line: GroceryListLine = {
      id: row.id,
      quantity: row.quantity,
      unit: row.unit,
      checked: row.checked,
    };

    const existing = groups.get(row.ingredient_id);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(row.ingredient_id, {
        ingredientId: row.ingredient_id,
        name: row.ingredients.name_fr ?? row.ingredients.name,
        lines: [line],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aChecked = a.lines.every((l) => l.checked);
    const bChecked = b.lines.every((l) => l.checked);
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

// Aggregates every recipe assigned in the given week into grocery list
// lines, summing quantities that share an ingredient and unit. Replaces
// only previously auto-generated lines (source_recipe_id set) so manually
// added items survive regeneration.
export async function generateGroceryListFromWeek(weekStart: Date) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: entries, error: entriesError } = await supabase
    .from("meal_plan_entries")
    .select("recipe_id")
    .gte("planned_date", formatDate(weekStart))
    .lte("planned_date", formatDate(addDays(weekStart, 6)));

  if (entriesError) throw entriesError;

  const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id))];

  await supabase
    .from("grocery_list_items")
    .delete()
    .not("source_recipe_id", "is", null);

  if (recipeIds.length === 0) return;

  const { data: lines, error: linesError } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id, ingredient_id, quantity, unit")
    .in("recipe_id", recipeIds);

  if (linesError) throw linesError;

  type Group = {
    ingredientId: string;
    unit: string | null;
    quantity: number | null;
    sourceRecipeId: string;
  };
  const groups = new Map<string, Group>();

  for (const line of lines ?? []) {
    const unit = line.unit?.trim().toLowerCase() || null;
    const key = `${line.ingredient_id}::${unit ?? ""}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ingredientId: line.ingredient_id,
        unit,
        quantity: line.quantity != null ? Number(line.quantity) : null,
        sourceRecipeId: line.recipe_id,
      });
    } else if (line.quantity != null) {
      existing.quantity = (existing.quantity ?? 0) + Number(line.quantity);
    }
  }

  const rows = Array.from(groups.values()).map((g) => ({
    user_id: user.id,
    ingredient_id: g.ingredientId,
    quantity: g.quantity,
    unit: g.unit,
    source_recipe_id: g.sourceRecipeId,
  }));

  const { error: insertError } = await supabase
    .from("grocery_list_items")
    .insert(rows);

  if (insertError) throw insertError;
}

export async function setItemChecked(itemId: string, checked: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("grocery_list_items")
    .update({ checked })
    .eq("id", itemId);

  if (error) throw error;
}

export async function removeGroceryItem(itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("grocery_list_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}
