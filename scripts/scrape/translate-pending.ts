import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import * as deepl from "deepl-node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/types";
import { createAdminClient } from "./supabaseAdmin";
import { translateIngredientNames, translateNotes, translateRecipeText } from "./translate";

type Admin = SupabaseClient<Database>;

interface Args {
  limit: number | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string) =>
    args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  return { limit: get("limit") ? parseInt(get("limit")!, 10) : null };
}

// Translates and writes back in chunks rather than collecting a whole
// translated batch before touching the DB — so if a chunk throws partway
// through (most likely QuotaExceededError), everything translated in prior
// chunks is already saved and a rerun picks up exactly where this stopped
// (queries below all filter on the *_fr column still being null).
async function processInChunks<T>(
  items: T[],
  chunkSize: number,
  translateChunk: (chunk: T[]) => Promise<string[]>,
  updateOne: (item: T, translated: string) => Promise<void>,
): Promise<{ done: number; stoppedEarly: boolean; error?: Error }> {
  let done = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    let results: string[];
    try {
      results = await translateChunk(chunk);
    } catch (err) {
      return { done, stoppedEarly: true, error: err as Error };
    }
    for (const [j, item] of chunk.entries()) {
      await updateOne(item, results[j]);
    }
    done += chunk.length;
  }
  return { done, stoppedEarly: false };
}

async function translatePendingIngredients(
  admin: Admin,
  deeplClient: deepl.Translator,
  limit: number | null,
): Promise<boolean> {
  let query = admin.from("ingredients").select("id, name").is("name_fr", null);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`select ingredients failed: ${error.message}`);
  if (!data || data.length === 0) {
    console.log("ingredients: nothing to translate");
    return false;
  }

  const { done, stoppedEarly, error: chunkError } = await processInChunks(
    data,
    50,
    (chunk) => translateIngredientNames(deeplClient, chunk.map((r) => r.name)),
    async (row, nameFr) => {
      const { error: updateError } = await admin
        .from("ingredients")
        .update({ name_fr: nameFr })
        .eq("id", row.id);
      if (updateError) console.warn(`  failed to update ingredient ${row.id}: ${updateError.message}`);
    },
  );

  console.log(
    `ingredients: ${done}/${data.length} translated` +
      (stoppedEarly ? ` (stopped: ${chunkError?.message})` : ""),
  );
  return stoppedEarly;
}

async function translatePendingRecipes(
  admin: Admin,
  deeplClient: deepl.Translator,
  limit: number | null,
): Promise<boolean> {
  let query = admin
    .from("recipes")
    .select("id, title, description, instructions")
    .is("title_fr", null);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`select recipes failed: ${error.message}`);
  if (!data || data.length === 0) {
    console.log("recipes: nothing to translate");
    return false;
  }

  let done = 0;
  let failed = 0;
  for (const recipe of data) {
    try {
      const result = await translateRecipeText(deeplClient, {
        title: recipe.title,
        description: recipe.description,
        instructions: recipe.instructions,
      });
      const { error: updateError } = await admin
        .from("recipes")
        .update({
          title_fr: result.titleFr,
          description_fr: result.descriptionFr,
          instructions_fr: result.instructionsFr,
        })
        .eq("id", recipe.id);
      if (updateError) throw new Error(updateError.message);
      done++;
    } catch (err) {
      if (err instanceof deepl.QuotaExceededError) {
        console.log(
          `recipes: ${done}/${data.length} translated (stopped: ${err.message})`,
        );
        return true;
      }
      console.warn(`  recipe ${recipe.id} failed: ${(err as Error).message}`);
      failed++;
    }
  }
  console.log(`recipes: ${done}/${data.length} translated, ${failed} failed`);
  return false;
}

async function translatePendingIngredientNotes(
  admin: Admin,
  deeplClient: deepl.Translator,
  limit: number | null,
): Promise<boolean> {
  let query = admin
    .from("recipe_ingredients")
    .select("id, note")
    .not("note", "is", null)
    .is("note_fr", null);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`select recipe_ingredients failed: ${error.message}`);
  if (!data || data.length === 0) {
    console.log("ingredient notes: nothing to translate");
    return false;
  }

  const { done, stoppedEarly, error: chunkError } = await processInChunks(
    data,
    50,
    (chunk) => translateNotes(deeplClient, chunk.map((r) => r.note!)),
    async (row, noteFr) => {
      const { error: updateError } = await admin
        .from("recipe_ingredients")
        .update({ note_fr: noteFr })
        .eq("id", row.id);
      if (updateError) {
        console.warn(`  failed to update recipe_ingredient ${row.id}: ${updateError.message}`);
      }
    },
  );

  console.log(
    `ingredient notes: ${done}/${data.length} translated` +
      (stoppedEarly ? ` (stopped: ${chunkError?.message})` : ""),
  );
  return stoppedEarly;
}

async function main() {
  const args = parseArgs();
  if (!process.env.DEEPL_API_KEY) {
    throw new Error("DEEPL_API_KEY must be set (see .env.local.example).");
  }
  const deeplClient = new deepl.Translator(process.env.DEEPL_API_KEY);
  const admin = createAdminClient();

  // Ingredients first: they're shared across recipes (translating "salt"
  // once instead of once per recipe that uses it), so doing them first gets
  // the most value out of a limited quota before moving to recipe-specific
  // text.
  if (await translatePendingIngredients(admin, deeplClient, args.limit)) return;
  if (await translatePendingRecipes(admin, deeplClient, args.limit)) return;
  await translatePendingIngredientNotes(admin, deeplClient, args.limit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
