# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

meal-chooser: pick meals for the week and generate grocery lists. Recipe data is
scraped from justonecookbook.com and koreanbapsang.com and stored in Supabase,
translated to French; users assign recipes to days on a weekly meal plan and
build a grocery list from the ingredients.

Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage),
deployed on Vercel.

## Commands

- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npm start` — run the production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`, extends
  `next/core-web-vitals` + `next/typescript`)
- `npx tsc --noEmit` — type-check without emitting
- `npm run scrape -- --site=<justonecookbook|koreanbapsang|all> [--limit=N] [--dry-run]`
  — scrape + store recipes (no translation; see Architecture below)
- `npm run translate -- [--limit=N]` — translate whatever's pending in the DB
  to French (separate step, so scraping never blocks on translation quota)

No test runner is configured yet.

## Architecture

- `src/app/` — App Router routes, layouts, and pages.
- `src/lib/supabase/`
  - `client.ts` — browser Supabase client (`createBrowserClient`), for use in
    Client Components.
  - `server.ts` — server Supabase client (`createServerClient`), for use in
    Server Components/Route Handlers; wires cookies via `next/headers`.
  - `types.ts` — hand-written `Database` type used as the generic for both
    clients. Keep this in sync with `supabase/migrations/` by hand (no
    `supabase gen types` step is wired up yet).
- `supabase/migrations/` — SQL migrations, applied via the Supabase CLI or
  pasted into the Supabase SQL editor (no CLI is linked in this project —
  migrations are applied manually). Schema:
  - `recipes` — scraped recipe data. `instructions`/`instructions_fr` are
    jsonb arrays of `{ section: string | null, text: string }` mirroring the
    source's schema.org HowToStep/HowToSection structure (`section` groups
    steps under a heading, e.g. "To Make the Soup Stock"). `image_path` is a
    path into the `recipe-images` Storage bucket, not the original site's URL.
  - `ingredients` — canonical ingredient names (deduped case-insensitively by
    `name` across recipes) with a French translation in `name_fr`.
  - `recipe_ingredients` — per-recipe ingredient line, joining `recipes` to
    `ingredients`. `raw_text` is the original line as scraped (source of
    truth for display); `quantity`/`unit`/`note`/`note_fr` are a best-effort
    parse of it (see `scripts/scrape/parseIngredient.ts`).
  - `meal_plan_entries` — a recipe assigned to a `planned_date` + `meal_slot`
    for a given `user_id`.
  - `grocery_list_items` — per-user grocery list, optionally linked back to
    the recipe it was generated from via `source_recipe_id`.
  - RLS: `recipes`/`ingredients`/`recipe_ingredients` are readable by any
    authenticated user and writable only via the service-role key (i.e. the
    scraper, not end users). `meal_plan_entries`/`grocery_list_items` are
    scoped to `auth.uid() = user_id`.
  - Storage: `recipe-images` bucket, public read, written by the scraper via
    the service role.
- `scripts/scrape/` — two independent, separately-resumable passes: scraping
  (`npm run scrape`) never depends on DeepL, so it can finish even with zero
  translation quota left; translation (`npm run translate`) reads whatever's
  pending straight from the DB, not from the source site, so it never
  re-scrapes anything.
  - `sitemap.ts` — lists candidate recipe URLs from the site's WordPress
    sitemap.
  - `extract.ts` — parses the schema.org `Recipe` JSON-LD each site embeds
    (both run WP Recipe Maker or a similar plugin). Returns `null` for posts
    with no `Recipe` node (roundups, how-tos) — the caller skips those.
    Decodes HTML entities that both sites leave literally embedded in
    otherwise-plain-text JSON-LD fields (e.g. `&#32;`, `&#39;`), and drops
    blank ingredient lines (some WPRM recipes use one as visual spacing in
    the source, which isn't a real ingredient).
  - `httpClient.ts` — a `node:https`-based GET with redirect following, used
    everywhere instead of `fetch()`. **Load-bearing**: justonecookbook.com's
    Cloudflare bot management fingerprints and blocks Node's `fetch`
    (undici) specifically — same headers, same User-Agent as curl, but
    `fetch` gets a 403 while curl and Node's classic `https` module both get
    200. Don't reintroduce `fetch()` for outbound requests here.
  - `parseIngredient.ts` — best-effort regex parse of a free-text ingredient
    line (e.g. `"1-3/4 cups all purpose flour"`) into quantity/unit/name/note.
    Handles unicode fractions, hyphen mixed-fractions, and ranges ("N-M", "N
    to M") — including nested parentheticals — but this is hand-formatted
    human text, so it will still misparse some lines (e.g. a range whose
    upper bound is itself a mixed fraction, like "1 to 1-1/2 teaspoons");
    `raw_text` is always kept alongside as the fallback.
  - `translate.ts` — pure translation functions (no scraping/DB knowledge),
    used only by `translate-pending.ts`: `translateIngredientNames`,
    `translateNotes`, `translateRecipeText`. Each batches multiple strings
    into one DeepL call (chunked at 50 texts/request) and passes a `context`
    hint describing the domain (Japanese/Korean cooking loanwords), since
    DeepL otherwise translates isolated ingredient names with no surrounding
    sentence and misreads some loanwords as English words (e.g. "sake" →
    "pour…", read as "for the sake of"). A few loanwords DeepL still gets
    wrong even with context are hardcoded in `INGREDIENT_NAME_OVERRIDES`.
  - `image.ts` — downloads the hero image (preferring the `og:image` meta
    tag, which is reliably full-size on both sites over the JSON-LD `image`
    array) and uploads it to the `recipe-images` bucket.
  - `db.ts` — scrape-phase DB writes: `getScrapedUrls` (so `run.ts` can skip
    URLs already in the table rather than re-crawling them), `insertRecipe`
    (plain insert, not upsert — translation fields are left null and filled
    in later), `insertRecipeIngredients`. Never touches `*_fr` columns.
  - `run.ts` — the scrape CLI: sitemap → filter out already-scraped URLs →
    extract → parse ingredients → download image → insert. No DeepL
    dependency at all.
  - `translate-pending.ts` — the translate CLI: three independent passes,
    each querying the DB for rows where the relevant `*_fr` column is still
    null — (1) `ingredients.name_fr` (translated once per unique ingredient,
    not once per recipe that uses it — the biggest lever for saving quota,
    since common ingredients like "salt" repeat across many recipes),
    (2) `recipes.title_fr`/`description_fr`/`instructions_fr`,
    (3) `recipe_ingredients.note_fr`. Writes back per chunk (not once at the
    end), and stops cleanly on `deepl.QuotaExceededError` — so a run that
    exhausts quota partway through a phase keeps everything translated so
    far, and a later rerun resumes from exactly where it stopped with no
    special flags needed.

## State

271 recipes are in the database (251 justonecookbook.com + 20
koreanbapsang.com). Both sites are far from fully scraped — justonecookbook.com
has ~1445 candidate pages, koreanbapsang.com ~275. Scraping itself isn't
blocked on anything; just rerun `npm run scrape -- --site=all` (it automatically
skips whatever's already saved). Translation *is* currently blocked: the DeepL
account is at its quota limit (1,000,000 characters/billing period) with 12
recipes and 63 ingredients pending — rerun `npm run translate` once quota is
available again (check the DeepL dashboard for the reset date, or upgrade the
plan).

## Environment

Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by both
  Supabase clients above.
- `SUPABASE_SERVICE_ROLE_KEY` — for privileged server-side work (e.g. the
  recipe scraper), never expose to the browser.
- `DEEPL_API_KEY` — used by the scraper's translation step.

## Not yet implemented

- Any UI beyond the default scaffolded page.
- Auth flow (RLS policies assume `auth.uid()`, but no sign-in UI exists yet).
- Finishing the scrape (see State above).
