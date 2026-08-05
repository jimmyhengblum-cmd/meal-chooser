import { decode } from "he";
import { USER_AGENT } from "./sites";
import { httpGetText } from "./httpClient";
import type { RecipeInstructionStep } from "../../src/lib/supabase/types";

export interface ExtractedRecipe {
  sourceUrl: string;
  title: string;
  description: string | null;
  author: string | null;
  imageUrl: string | null;
  servings: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredientLines: string[];
  instructions: RecipeInstructionStep[];
}

const LD_JSON_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;
const OG_IMAGE_RES = [
  /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/,
  /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/,
];

function findOgImage(html: string): string | null {
  for (const re of OG_IMAGE_RES) {
    const match = re.exec(html);
    if (match) return match[1];
  }
  return null;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// WP Recipe Maker embeds HTML-entity-encoded text (e.g. "&#32;", "&amp;",
// "&#39;") directly in otherwise plain-text JSON-LD fields — decode once here
// so nothing downstream (translation, storage, display) sees raw entities.
function decodeText(s: string): string {
  return decode(s);
}

function hasType(node: any, type: string): boolean {
  return asArray(node?.["@type"]).includes(type);
}

// Recipe JSON-LD uses ISO 8601 durations like "PT15M" or "PT1H30M".
function parseDurationMinutes(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(duration);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}

function pickImageUrl(image: unknown): string | null {
  const images = asArray(image as any).map((img) =>
    typeof img === "string" ? img : img?.url,
  );
  // JOC/Bapsang list full-size first, then cropped variants (e.g. -500x500).
  // Prefer the first entry without a trailing "-<w>x<h>" suffix.
  const fullSize = images.find(
    (url) => typeof url === "string" && !/-\d+x\d+(\.\w+)$/.test(url),
  );
  return fullSize ?? images[0] ?? null;
}

function resolveAuthor(recipe: any, graph: any[]): string | null {
  const author = recipe.author;
  if (!author) return null;
  if (typeof author === "string") return author;
  if (author.name) return author.name;
  if (author["@id"]) {
    const person = graph.find((n) => n["@id"] === author["@id"]);
    return person?.name ?? null;
  }
  return null;
}

// Flattens schema.org recipeInstructions, which is either a flat list of
// HowToStep, or HowToStep/HowToSection mixed (a HowToSection groups a set of
// HowToStep under a "name", e.g. "To Make the Soup Stock").
function flattenInstructions(recipeInstructions: unknown): RecipeInstructionStep[] {
  const steps: RecipeInstructionStep[] = [];

  function visit(node: any, section: string | null) {
    if (typeof node === "string") {
      steps.push({ section, text: decodeText(node) });
      return;
    }
    if (hasType(node, "HowToSection")) {
      const sectionName = node.name ? decodeText(node.name) : section;
      for (const child of asArray(node.itemListElement)) {
        visit(child, sectionName);
      }
      return;
    }
    if (hasType(node, "HowToStep")) {
      const text = node.text ?? node.name;
      if (text) steps.push({ section, text: decodeText(text) });
    }
  }

  for (const node of asArray(recipeInstructions as any)) {
    visit(node, null);
  }
  return steps;
}

export async function fetchExtractedRecipe(
  url: string,
): Promise<ExtractedRecipe | null> {
  const html = await httpGetText(url, { "User-Agent": USER_AGENT });

  for (const match of html.matchAll(LD_JSON_RE)) {
    let data: any;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const graph: any[] = data["@graph"] ?? [data];
    const recipe = graph.find((node) => hasType(node, "Recipe"));
    if (!recipe) continue;

    const yieldValue = asArray(recipe.recipeYield as any)[0];

    const author = resolveAuthor(recipe, graph);

    return {
      sourceUrl: url,
      title: decodeText(recipe.name),
      description: recipe.description ? decodeText(recipe.description) : null,
      author: author ? decodeText(author) : null,
      imageUrl: findOgImage(html) ?? pickImageUrl(recipe.image),
      servings: yieldValue != null ? String(yieldValue) : null,
      prepMinutes: parseDurationMinutes(recipe.prepTime),
      cookMinutes: parseDurationMinutes(recipe.cookTime),
      totalMinutes: parseDurationMinutes(recipe.totalTime),
      // Some WPRM recipes include a blank line in recipeIngredient (used on
      // the site as visual spacing, e.g. between ingredient sub-groups).
      ingredientLines: asArray(recipe.recipeIngredient as any)
        .map(decodeText)
        .filter((line) => line.trim().length > 0),
      instructions: flattenInstructions(recipe.recipeInstructions),
    };
  }

  // No Recipe node found: this post isn't a recipe (roundup, article, etc).
  return null;
}
