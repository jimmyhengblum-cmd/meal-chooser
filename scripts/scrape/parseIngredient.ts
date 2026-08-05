export interface ParsedIngredientLine {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
}

// Best-effort parse of a free-text recipe ingredient line, e.g.
// '1/4 package enoki mushrooms ((1.8 oz, 50 g))' ->
// { quantity: 0.25, unit: "package", name: "enoki mushrooms", note: "1.8 oz, 50 g" }
// Recipe sites write these by hand, so this will misparse a meaningful
// fraction of lines (odd units, missing quantities, ranges) — `raw_text` is
// kept alongside as the source of truth for display.

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const UNITS = [
  "cups?",
  "tbsps?",
  "tablespoons?",
  "tsps?",
  "teaspoons?",
  "oz",
  "ounces?",
  "lbs?",
  "pounds?",
  "g",
  "grams?",
  "kg",
  "ml",
  "l",
  "liters?",
  "packages?",
  "packets?",
  "blocks?",
  "cloves?",
  "pinch(?:es)?",
  "dash(?:es)?",
  "slices?",
  "cans?",
  "pieces?",
  "sheets?",
  "stalks?",
  "sprigs?",
  "knobs?",
  "bunch(?:es)?",
  "inch(?:es)?",
];
const UNIT_RE = new RegExp(`^(${UNITS.join("|")})\\b\\.?`, "i");

const FRACTION_CHARS = "¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞";

// Tried in order — most specific pattern first, since e.g. "1-3/4" (a hyphen
// mixed number, 1.75) must not be caught by the plainer "N-M" range pattern.
const QUANTITY_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpExecArray) => number }> = [
  // "1-3/4" or "1 - 3/4": hyphen-joined mixed number with a written fraction.
  {
    re: /^(\d+)\s*-\s*(\d+)\/(\d+)/,
    parse: (m) => Number(m[1]) + Number(m[2]) / Number(m[3]),
  },
  // "1-⅓" or "1 - ⅓": hyphen-joined mixed number with a unicode fraction.
  {
    re: new RegExp(`^(\\d+)\\s*-\\s*([${FRACTION_CHARS}])`),
    parse: (m) => Number(m[1]) + UNICODE_FRACTIONS[m[2]],
  },
  // "1 3/4": space-separated mixed number.
  { re: /^(\d+)\s+(\d+)\/(\d+)/, parse: (m) => Number(m[1]) + Number(m[2]) / Number(m[3]) },
  // "3/4": simple fraction.
  { re: /^(\d+)\/(\d+)/, parse: (m) => Number(m[1]) / Number(m[2]) },
  // "1½": number glued to a unicode fraction.
  {
    re: new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*([${FRACTION_CHARS}])`),
    parse: (m) => Number(m[1]) + UNICODE_FRACTIONS[m[2]],
  },
  // "½": bare unicode fraction.
  { re: new RegExp(`^([${FRACTION_CHARS}])`), parse: (m) => UNICODE_FRACTIONS[m[1]] },
  // "4-5", "4 to 5", "1.5 to 2.5": a range written with a hyphen or "to" —
  // use the midpoint as the best single-number estimate.
  {
    re: /^(\d+(?:\.\d+)?)\s*(?:-|\bto\b)\s*(\d+(?:\.\d+)?)/,
    parse: (m) => (Number(m[1]) + Number(m[2])) / 2,
  },
  // "4" or "1.5": bare number.
  { re: /^(\d+(?:\.\d+)?)/, parse: (m) => Number(m[1]) },
];

function matchLeadingQuantity(text: string): { value: number; length: number } | null {
  for (const { re, parse } of QUANTITY_PATTERNS) {
    const m = re.exec(text);
    if (m) return { value: parse(m), length: m[0].length };
  }
  return null;
}

// Pulls out parenthetical groups, one level of nesting deep — matches this
// dataset's "((note))" pattern as well as plain "(note)".
const PAREN_RE = /\(((?:[^()]|\([^()]*\))*)\)/g;

export function parseIngredientLine(raw: string): ParsedIngredientLine {
  let rest = raw.trim();

  let quantity: number | null = null;
  const qtyMatch = matchLeadingQuantity(rest);
  if (qtyMatch) {
    quantity = qtyMatch.value;
    rest = rest.slice(qtyMatch.length).replace(/^\s+/, "");
  }

  let unit: string | null = null;
  const unitMatch = UNIT_RE.exec(rest.trim());
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    rest = rest.trim().slice(unitMatch[0].length);
    rest = rest.replace(/^\s*of\b/i, "");
  }

  const notes: string[] = [];
  rest = rest.replace(PAREN_RE, (_match, inner) => {
    // "((note))" (WPRM's double-wrap): unwrap the redundant outer pair. Only
    // do this when the *entire* captured content is itself one matching
    // pair — e.g. "small and thin (or 20 kirby...)" must keep its trailing
    // ")", since that closes a distinct nested aside, not a redundant wrap.
    const doubleWrapped = /^\((.*)\)$/.exec(inner);
    notes.push((doubleWrapped ? doubleWrapped[1] : inner).trim());
    return " ";
  });
  // Trailing " - optional" / " - to taste" style flags, common on WPRM sites.
  rest = rest.replace(/\s+-\s+(\S.*)$/, (_match, flag) => {
    notes.push(flag.trim());
    return "";
  });

  const name = rest.replace(/\s+/g, " ").trim();

  return {
    name: name || raw.trim(),
    quantity,
    unit,
    note: notes.length > 0 ? notes.join("; ") : null,
  };
}
