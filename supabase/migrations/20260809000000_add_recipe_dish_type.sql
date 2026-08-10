-- Dish-type flag, set by an LLM classifier (see scripts/scrape/classify-pending.ts)
-- instead of the title-keyword heuristic previously used to guess whether a
-- scraped recipe is a full meal (src/lib/plan.ts's isLikelyFullMeal). Null
-- until classified; generateWeekPlan falls back to that heuristic for rows
-- still null so newly scraped recipes aren't excluded from auto-fill before
-- `npm run classify` has run.
alter table recipes
  add column dish_type text
  constraint recipes_dish_type_check
  check (dish_type in ('plat', 'entree', 'dessert', 'sauce_condiment', 'boisson', 'autre'));

create index on recipes (dish_type);
