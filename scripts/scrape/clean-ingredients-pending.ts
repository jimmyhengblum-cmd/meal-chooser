import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "./supabaseAdmin";
import { cleanIngredients, type IngredientCorrection } from "./cleanIngredients";

interface Args {
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  return {
    dryRun: args.includes("--dry-run"),
    limit: get("limit") ? parseInt(get("limit")!, 10) : null,
  };
}

const PAGE_SIZE = 1000;

async function main() {
  const args = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set (see .env.local.example).");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const admin = createAdminClient();

  const ingredients: { id: string; name: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("ingredients")
      .select("id, name")
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`select ingredients failed: ${error.message}`);
    ingredients.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const toSend = args.limit ? ingredients.slice(0, args.limit) : ingredients;
  console.log(`sending ${toSend.length} ingredients to Claude...`);
  const corrections = await cleanIngredients(client, toSend);
  console.log(`got ${corrections.length} proposed corrections`);

  // Original name -> id, used to resolve merge targets and to detect a
  // rename that collides with an already-existing ingredient (which must be
  // treated as a merge instead, since `ingredients.name` is unique).
  const nameToId = new Map<string, string>();
  for (const ing of ingredients) nameToId.set(ing.name.toLowerCase(), ing.id);

  const finalTarget = new Map<string, string>(); // id -> id to merge into
  const renames = new Map<string, string>(); // id -> new name (no merge)
  const flagged: IngredientCorrection[] = [];

  for (const c of corrections) {
    if (c.action === "flag_not_ingredient") {
      flagged.push(c);
      continue;
    }
    if (c.action === "merge") {
      const targetId = nameToId.get(c.targetName.toLowerCase());
      if (!targetId || targetId === c.id) {
        console.warn(`  skip merge ${c.id}: target "${c.targetName}" not found`);
        continue;
      }
      finalTarget.set(c.id, targetId);
      continue;
    }
    // rename: if the new name collides with an existing different
    // ingredient, that's really a merge into it.
    const collisionId = nameToId.get(c.newName.toLowerCase());
    if (collisionId && collisionId !== c.id) {
      finalTarget.set(c.id, collisionId);
    } else {
      renames.set(c.id, c.newName);
    }
  }

  // Resolve merge chains (A -> B -> C) to their final root.
  const resolveRoot = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    while (finalTarget.has(current) && !seen.has(current)) {
      seen.add(current);
      current = finalTarget.get(current)!;
    }
    return current;
  };

  const nameById = new Map(ingredients.map((i) => [i.id, i.name]));
  let merged = 0;
  let renamed = 0;
  let failed = 0;

  for (const [id] of finalTarget) {
    const targetId = resolveRoot(id);
    const label = `${JSON.stringify(nameById.get(id))} -> ${JSON.stringify(nameById.get(targetId) ?? renames.get(targetId))}`;
    if (args.dryRun) {
      console.log(`merge   ${label}`);
      merged++;
      continue;
    }
    try {
      const { error: e1 } = await admin
        .from("recipe_ingredients")
        .update({ ingredient_id: targetId })
        .eq("ingredient_id", id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await admin
        .from("grocery_list_items")
        .update({ ingredient_id: targetId })
        .eq("ingredient_id", id);
      if (e2) throw new Error(e2.message);
      const { error: e3 } = await admin.from("ingredients").delete().eq("id", id);
      if (e3) throw new Error(e3.message);
      console.log(`merged  ${label}`);
      merged++;
    } catch (err) {
      console.warn(`  merge ${id} failed: ${(err as Error).message}`);
      failed++;
    }
  }

  for (const [id, newName] of renames) {
    const label = `${JSON.stringify(nameById.get(id))} -> ${JSON.stringify(newName)}`;
    if (args.dryRun) {
      console.log(`rename  ${label}`);
      renamed++;
      continue;
    }
    const { error } = await admin
      .from("ingredients")
      .update({ name: newName, name_fr: null })
      .eq("id", id);
    if (error) {
      console.warn(`  rename ${id} failed: ${error.message}`);
      failed++;
      continue;
    }
    console.log(`renamed ${label}`);
    renamed++;
  }

  console.log(
    `\nclean-ingredients: ${merged} merged, ${renamed} renamed, ${failed} failed${args.dryRun ? " (dry run — no writes)" : ""}`,
  );
  if (flagged.length > 0) {
    console.log(`${flagged.length} flagged as not real ingredients (needs manual review, not touched):`);
    for (const f of flagged) console.log(`  ${f.id}  ${JSON.stringify(nameById.get(f.id))}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
