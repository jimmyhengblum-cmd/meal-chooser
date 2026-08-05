import type { Translator } from "deepl-node";
import type { RecipeInstructionStep } from "../../src/lib/supabase/types";

// Translated in isolation (just the bare ingredient name, no sentence), DeepL
// misreads some transliterated loanwords as ordinary English words — e.g.
// the Japanese rice wine "sake" comes back as "pour…", as if translating
// "for the sake of" — even with a `context` hint. The same word inside a full
// instruction sentence translates correctly, so this only needs to cover
// names as they appear standing alone in an ingredient list.
const INGREDIENT_NAME_OVERRIDES: Record<string, string> = {
  sake: "saké",
};

const INGREDIENT_CONTEXT =
  "These are recipe ingredient names/notes from a Japanese or Korean cooking website, " +
  "given in isolation with no surrounding sentence. Some are transliterated loanwords " +
  "(e.g. sake, mirin, miso, gochujang) — treat them as culinary/ingredient terms, not " +
  "common English words.";

const RECIPE_TEXT_CONTEXT =
  "This is a recipe (title, description, instructions) from a Japanese or Korean " +
  "cooking website.";

// DeepL has no hard documented cap on texts-per-request for this endpoint, but
// chunking keeps individual requests small and means a mid-run quota cutoff
// only loses the in-flight chunk, not the whole batch.
const CHUNK_SIZE = 50;

async function translateBatch(
  deepl: Translator,
  texts: string[],
  context: string,
): Promise<string[]> {
  if (texts.length === 0) return [];
  // DeepL rejects empty strings outright; pass them through untranslated
  // rather than letting one blank value fail the whole chunk.
  const nonEmptyIdxs: number[] = [];
  const nonEmpty: string[] = [];
  texts.forEach((text, i) => {
    if (text.trim().length > 0) {
      nonEmptyIdxs.push(i);
      nonEmpty.push(text);
    }
  });

  const results: string[] = [...texts];
  for (let i = 0; i < nonEmpty.length; i += CHUNK_SIZE) {
    const chunk = nonEmpty.slice(i, i + CHUNK_SIZE);
    const translated = await deepl.translateText(chunk, "en", "fr", { context });
    translated.forEach((t, j) => {
      results[nonEmptyIdxs[i + j]] = t.text;
    });
  }
  return results;
}

export async function translateIngredientNames(
  deepl: Translator,
  names: string[],
): Promise<string[]> {
  const toTranslate: string[] = [];
  const slots = names.map((name) => {
    const override = INGREDIENT_NAME_OVERRIDES[name.toLowerCase()];
    if (override != null) return { literal: override, idx: null as number | null };
    return { literal: null as string | null, idx: toTranslate.push(name) - 1 };
  });
  const translated = await translateBatch(deepl, toTranslate, INGREDIENT_CONTEXT);
  return slots.map((slot) => slot.literal ?? translated[slot.idx!]);
}

export function translateNotes(deepl: Translator, notes: string[]): Promise<string[]> {
  return translateBatch(deepl, notes, INGREDIENT_CONTEXT);
}

export interface RecipeTextFields {
  title: string;
  description: string | null;
  instructions: RecipeInstructionStep[];
}

export interface TranslatedRecipeText {
  titleFr: string;
  descriptionFr: string | null;
  instructionsFr: RecipeInstructionStep[];
}

export async function translateRecipeText(
  deepl: Translator,
  recipe: RecipeTextFields,
): Promise<TranslatedRecipeText> {
  const sections = [
    ...new Set(
      recipe.instructions.map((s) => s.section).filter((s): s is string => s != null),
    ),
  ];
  const steps = recipe.instructions.map((s) => s.text);

  const texts: string[] = [];
  const push = (text: string) => texts.push(text) - 1;

  const titleIdx = push(recipe.title);
  const descriptionIdx = recipe.description != null ? push(recipe.description) : null;
  const sectionIdxs = sections.map(push);
  const stepIdxs = steps.map(push);

  const results = await translateBatch(deepl, texts, RECIPE_TEXT_CONTEXT);
  const fr = (idx: number) => results[idx];

  const sectionMap = new Map(sections.map((s, i) => [s, fr(sectionIdxs[i])]));

  const instructionsFr: RecipeInstructionStep[] = recipe.instructions.map((step, i) => ({
    section: step.section != null ? (sectionMap.get(step.section) ?? step.section) : null,
    text: fr(stepIdxs[i]),
  }));

  return {
    titleFr: fr(titleIdx),
    descriptionFr: descriptionIdx != null ? fr(descriptionIdx) : null,
    instructionsFr,
  };
}
