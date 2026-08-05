-- Recipes scraped from a source site. Instructions are stored as JSON
-- mirroring the source's schema.org HowToStep/HowToSection structure:
-- [{ "section": string | null, "text": string }, ...], in display order.
-- `instructions_fr` has the same shape with translated `text`.
create table recipes (
  id uuid primary key default gen_random_uuid(),
  source_site text not null,
  source_url text not null unique,
  title text not null,
  title_fr text,
  description text,
  description_fr text,
  author text,
  image_path text,
  servings text,
  prep_minutes int,
  cook_minutes int,
  total_minutes int,
  instructions jsonb not null default '[]'::jsonb,
  instructions_fr jsonb,
  created_at timestamptz not null default now()
);

-- Canonical ingredient names, deduplicated across recipes.
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_fr text
);

-- Join table: quantity of an ingredient within a specific recipe.
-- `quantity`/`unit` are Claude's best-effort structured parse of `raw_text`
-- (the original ingredient line, e.g. "1/4 package enoki mushrooms (1.8 oz,
-- 50 g)"); `raw_text` is kept as the source of truth for display/fallback.
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  raw_text text not null,
  quantity numeric,
  unit text,
  note text,
  display_order int not null default 0
);

-- A recipe assigned to a date on a user's weekly meal plan.
create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  planned_date date not null,
  meal_slot text not null default 'dinner',
  created_at timestamptz not null default now()
);

-- Grocery list generated from (or added on top of) a meal plan.
create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  quantity numeric,
  unit text,
  checked boolean not null default false,
  source_recipe_id uuid references recipes (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on recipes (source_site);
create index on recipe_ingredients (recipe_id);
create index on recipe_ingredients (ingredient_id);
create index on meal_plan_entries (user_id, planned_date);
create index on grocery_list_items (user_id);

alter table recipes enable row level security;
alter table ingredients enable row level security;
alter table recipe_ingredients enable row level security;
alter table meal_plan_entries enable row level security;
alter table grocery_list_items enable row level security;

-- Recipes and ingredients are shared reference data: readable by any
-- authenticated user, writable only via the service role (the scraper).
create policy "Recipes are readable by authenticated users"
  on recipes for select
  to authenticated
  using (true);

create policy "Ingredients are readable by authenticated users"
  on ingredients for select
  to authenticated
  using (true);

create policy "Recipe ingredients are readable by authenticated users"
  on recipe_ingredients for select
  to authenticated
  using (true);

-- Meal plan entries and grocery list items are private per user.
create policy "Users manage their own meal plan entries"
  on meal_plan_entries for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own grocery list items"
  on grocery_list_items for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage bucket for recipe hero images, downloaded from the source site at
-- scrape time so the app doesn't depend on hotlinking. Public read (images
-- aren't sensitive); writes go through the service role only.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

create policy "Recipe images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'recipe-images');
