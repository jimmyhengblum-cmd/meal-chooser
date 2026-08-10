import Image from "next/image";
import { notFound } from "next/navigation";
import { getRecipe } from "@/lib/recipes";
import { addToPlan } from "@/app/plan/actions";
import type { RecipeInstructionStep } from "@/lib/supabase/types";
import styles from "./page.module.css";
import buttons from "@/app/buttons.module.css";

function groupBySection(steps: RecipeInstructionStep[]) {
  const groups: { section: string | null; steps: RecipeInstructionStep[] }[] =
    [];

  for (const step of steps) {
    const current = groups.at(-1);
    if (current && current.section === step.section) {
      current.steps.push(step);
    } else {
      groups.push({ section: step.section, steps: [step] });
    }
  }

  return groups;
}

export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const planDate = Array.isArray(searchParams.planDate)
    ? searchParams.planDate[0]
    : searchParams.planDate;
  const planSlot = Array.isArray(searchParams.planSlot)
    ? searchParams.planSlot[0]
    : searchParams.planSlot;

  const recipe = await getRecipe(id);

  if (!recipe) notFound();

  const instructionGroups = groupBySection(recipe.instructions);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {recipe.imageUrl && (
          <div className={styles.imageWrapper}>
            <Image
              src={recipe.imageUrl}
              alt={recipe.title}
              fill
              sizes="(max-width: 700px) 100vw, 400px"
              className={styles.image}
            />
          </div>
        )}
        <div>
          <h1>{recipe.title}</h1>
          {recipe.description && <p className={styles.description}>{recipe.description}</p>}
          <dl className={styles.meta}>
            {recipe.servings && (
              <div>
                <dt>Servings</dt>
                <dd>{recipe.servings}</dd>
              </div>
            )}
            {recipe.prepMinutes != null && (
              <div>
                <dt>Prep</dt>
                <dd>{recipe.prepMinutes} min</dd>
              </div>
            )}
            {recipe.cookMinutes != null && (
              <div>
                <dt>Cook</dt>
                <dd>{recipe.cookMinutes} min</dd>
              </div>
            )}
          </dl>
          {planDate && planSlot && (
            <form action={addToPlan} className={styles.addToPlanForm}>
              <input type="hidden" name="plannedDate" value={planDate} />
              <input type="hidden" name="mealSlot" value={planSlot} />
              <input type="hidden" name="recipeId" value={recipe.id} />
              <button type="submit" className={`${buttons.btn} ${buttons.primary}`}>
                Add to plan for {planDate} ({planSlot})
              </button>
            </form>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <section>
          <h2>Ingredients</h2>
          <ul className={styles.ingredients}>
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>{ingredient.rawText}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Instructions</h2>
          {instructionGroups.map((group, i) => (
            <div key={i} className={styles.instructionGroup}>
              {group.section && <h3>{group.section}</h3>}
              <ol>
                {group.steps.map((step, j) => (
                  <li key={j}>{step.text}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
