import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import Anthropic from "@anthropic-ai/sdk";
import type { DishType } from "../../src/lib/supabase/types";
import { createAdminClient } from "./supabaseAdmin";
import { classifyDishTypes } from "./classifyDishType";

interface Args {
  limit: number | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  return { limit: get("limit") ? parseInt(get("limit")!, 10) : null };
}

// Kept small: each recipe's title (+ description) is short, but the model
// still needs to reason about every item in the batch, and a chunk that
// fails (rate limit, malformed tool call) only loses this chunk on rerun
// since dish_type stays null for anything not yet written back.
const CHUNK_SIZE = 40;

async function main() {
  const args = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set (see .env.local.example).");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const admin = createAdminClient();

  let query = admin.from("recipes").select("id, title, description").is("dish_type", null);
  if (args.limit) query = query.limit(args.limit);
  const { data, error } = await query;
  if (error) throw new Error(`select recipes failed: ${error.message}`);
  if (!data || data.length === 0) {
    console.log("dish_type: nothing to classify");
    return;
  }

  let done = 0;
  let failed = 0;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    let classifications: Map<string, DishType>;
    try {
      classifications = await classifyDishTypes(client, chunk);
    } catch (err) {
      console.warn(`  chunk ${i}-${i + chunk.length} failed: ${(err as Error).message}`);
      failed += chunk.length;
      continue;
    }

    for (const recipe of chunk) {
      const dishType = classifications.get(recipe.id);
      if (!dishType) {
        console.warn(`  recipe ${recipe.id} (${recipe.title}) missing from response`);
        failed++;
        continue;
      }
      const { error: updateError } = await admin
        .from("recipes")
        .update({ dish_type: dishType })
        .eq("id", recipe.id);
      if (updateError) {
        console.warn(`  failed to update recipe ${recipe.id}: ${updateError.message}`);
        failed++;
        continue;
      }
      done++;
    }
  }

  console.log(`dish_type: ${done}/${data.length} classified, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
