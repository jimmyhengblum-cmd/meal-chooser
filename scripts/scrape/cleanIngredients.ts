import type Anthropic from "@anthropic-ai/sdk";

// Cleans up the canonical `ingredients` list with an LLM instead of more
// regex: names in this table came from a mix of parsing passes over the
// years, so it accumulates entries that are garbled leftovers of a raw
// ingredient line (e.g. "or 2 scallions", "to 10 dumplings" — the range/"or"
// half of a quantity that a regex parser failed to strip), exact synonyms
// that should be one canonical ingredient ("scallion" / "scallions"), or
// lines that aren't ingredients at all (recipe notes/instructions that a
// scrape mistakenly captured as an ingredient line, e.g. "Mix all sauce
// ingredients well and set aside."). A single Claude call reasons over the
// *whole* list at once (not chunked) because spotting duplicates and
// leftover-fragment patterns needs cross-entry context a chunk wouldn't have.

const SYSTEM_PROMPT = `Tu vas recevoir la liste complète des ingrédients canoniques \
d'une base de recettes japonaises et coréennes (scrapées puis parsées \
automatiquement). Cette liste contient trois types de problèmes à corriger :

1. rename : un nom garblé, résidu d'un parsing quantité/unité raté (ex: "or 2 \
   scallions" → "scallions", "to 10 dumplings" → "dumplings", "3 tablespoons \
   chopped scallion," → "chopped scallion", "large large eggs" → "large eggs", \
   "- inch ginger" → "ginger"). Corrige uniquement le nom, ne change pas la \
   langue ni ne traduis rien.
2. merge : deux entrées différentes qui désignent le même ingrédient et \
   devraient n'en faire qu'une (variations singulier/pluriel, orthographe, \
   casse : "scallion" vs "scallions", "Egg" vs "egg"). Donne "target_name" \
   — le nom exact d'une AUTRE entrée de la liste à conserver comme forme \
   canonique — et l'entrée traitée sera fusionnée dedans. Préfère la forme la \
   plus propre/complète comme cible (ex: garde "scallions" plutôt que \
   "scallion" si les deux existent).
3. flag_not_ingredient : la ligne n'est pas un ingrédient du tout mais une \
   instruction, une note, un titre de recette, ou une indication de \
   quantité finale capturée par erreur comme ingrédient (ex: "Mix all sauce \
   ingredients well and set aside.", "Makes 16 pieces", "Visit the links \
   provided above for the ingredients for each recipe."). Signale-les sans \
   proposer de nom de remplacement — ils seront examinés manuellement.

Ne signale QUE les entrées à corriger : n'inclus pas les entrées déjà \
correctes dans ta réponse. En cas de doute sur un nom d'ingrédient légitime \
mais inhabituel (ex: un nom japonais/coréen translittéré), laisse-le tel \
quel plutôt que de le signaler. Réponds uniquement via l'outil fourni.`;

const CLEAN_TOOL: Anthropic.Tool = {
  name: "clean_ingredients",
  description:
    "Enregistre les corrections à apporter à la liste d'ingrédients — uniquement les entrées qui doivent changer.",
  input_schema: {
    type: "object",
    properties: {
      corrections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", description: "Le numéro de l'entrée dans la liste fournie." },
            action: { type: "string", enum: ["rename", "merge", "flag_not_ingredient"] },
            new_name: {
              type: "string",
              description: "Requis pour 'rename' : le nom corrigé.",
            },
            target_name: {
              type: "string",
              description:
                "Requis pour 'merge' : le nom exact d'une autre entrée de la liste dans laquelle fusionner celle-ci.",
            },
          },
          required: ["index", "action"],
        },
      },
    },
    required: ["corrections"],
  },
};

export interface CleanableIngredient {
  id: string;
  name: string;
}

export type IngredientCorrection =
  | { id: string; action: "rename"; newName: string }
  | { id: string; action: "merge"; targetName: string }
  | { id: string; action: "flag_not_ingredient" };

const MODEL = "claude-sonnet-5";

export async function cleanIngredients(
  client: Anthropic,
  ingredients: CleanableIngredient[],
): Promise<IngredientCorrection[]> {
  if (ingredients.length === 0) return [];

  const listing = ingredients.map((ing, i) => `${i}. ${ing.name}`).join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [CLEAN_TOOL],
    tool_choice: { type: "tool", name: "clean_ingredients" },
    messages: [
      {
        role: "user",
        content: `Voici les ${ingredients.length} ingrédients (un par ligne, numérotés) :\n${listing}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("clean_ingredients tool was not called");
  }

  const input = toolUse.input as {
    corrections: {
      index: number;
      action: "rename" | "merge" | "flag_not_ingredient";
      new_name?: string;
      target_name?: string;
    }[];
  };

  const result: IngredientCorrection[] = [];
  for (const c of input.corrections) {
    const ingredient = ingredients[c.index];
    if (!ingredient) continue;
    if (c.action === "rename" && c.new_name) {
      result.push({ id: ingredient.id, action: "rename", newName: c.new_name });
    } else if (c.action === "merge" && c.target_name) {
      result.push({ id: ingredient.id, action: "merge", targetName: c.target_name });
    } else if (c.action === "flag_not_ingredient") {
      result.push({ id: ingredient.id, action: "flag_not_ingredient" });
    }
  }
  return result;
}
