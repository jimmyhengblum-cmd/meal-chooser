import type Anthropic from "@anthropic-ai/sdk";
import type { DishType } from "../../src/lib/supabase/types";

export const DISH_TYPES: DishType[] = [
  "plat",
  "entree",
  "dessert",
  "sauce_condiment",
  "boisson",
  "autre",
];

const SYSTEM_PROMPT = `Tu es un expert culinaire spécialisé dans les cuisines japonaise et \
coréenne. On te donne une liste de recettes scrapées depuis des sites de cuisine \
japonaise (justonecookbook.com) et coréenne (koreanbapsang.com). Pour chacune, \
classe-la dans une des catégories suivantes selon ce qu'elle représente \
concrètement, pas selon son ingrédient principal :

- plat: un plat complet, mangeable comme repas (plat principal), qu'il soit \
  mijoté, grillé, sauté, une soupe/ragoût copieuse, un riz/nouilles garnis, etc.
- entree: une petite entrée ou un accompagnement servi à côté d'un plat \
  principal (banchan coréens, petites salades, amuse-bouches), pas un repas à \
  lui seul.
- dessert: sucré, servi en fin de repas (gâteaux, mochi, crèmes, fruits sucrés).
- sauce_condiment: sauce, assaisonnement, marinade, pâte, poudre, bouillon de \
  base, kimchi utilisé comme condiment — un composant d'un plat, pas un plat \
  en soi.
- boisson: boisson, avec ou sans alcool.
- autre: tout le reste — articles "how to" / techniques, roundups, ce qui ne \
  correspond à aucune catégorie ci-dessus.

Un titre qui mentionne un ingrédient de sauce/dessert/boisson (ex: "Grilled \
Oysters with Ponzu Sauce", "Gungjung Tteokbokki (Royal Court Rice Cake)") reste \
un "plat" complet s'il décrit une préparation entière et pas juste le \
condiment/dessert lui-même. Utilise le titre et, si fourni, la description, \
pour trancher. Réponds uniquement via l'outil fourni.`;

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_recipes",
  description: "Enregistre la catégorie de chaque recette de la liste, dans le même ordre.",
  input_schema: {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            dish_type: { type: "string", enum: DISH_TYPES },
          },
          required: ["id", "dish_type"],
        },
      },
    },
    required: ["classifications"],
  },
};

export interface ClassifiableRecipe {
  id: string;
  title: string;
  description: string | null;
}

const MODEL = "claude-sonnet-5";

export async function classifyDishTypes(
  client: Anthropic,
  recipes: ClassifiableRecipe[],
): Promise<Map<string, DishType>> {
  if (recipes.length === 0) return new Map();

  const listing = recipes
    .map((r, i) => `${i + 1}. [id=${r.id}] ${r.title}${r.description ? ` — ${r.description}` : ""}`)
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_recipes" },
    messages: [
      {
        role: "user",
        content: `Classe ces ${recipes.length} recettes :\n${listing}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("classify_recipes tool was not called");
  }

  const input = toolUse.input as {
    classifications: { id: string; dish_type: string }[];
  };

  const result = new Map<string, DishType>();
  for (const { id, dish_type } of input.classifications) {
    if ((DISH_TYPES as string[]).includes(dish_type)) {
      result.set(id, dish_type as DishType);
    }
  }
  return result;
}
