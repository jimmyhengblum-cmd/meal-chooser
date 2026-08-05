import Link from "next/link";
import Image from "next/image";
import { listRecipes, RECIPES_PAGE_SIZE } from "@/lib/recipes";
import styles from "./page.module.css";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RecipesPage(props: PageProps<"/recipes">) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(firstValue(searchParams.page)) || 1);
  const planDate = firstValue(searchParams.planDate);
  const planSlot = firstValue(searchParams.planSlot);

  const planParams =
    planDate && planSlot
      ? `&planDate=${planDate}&planSlot=${planSlot}`
      : "";

  const { recipes, count } = await listRecipes(page);
  const totalPages = Math.max(1, Math.ceil(count / RECIPES_PAGE_SIZE));

  return (
    <div className={styles.container}>
      <h1>Recipes</h1>
      {planDate && planSlot && (
        <p className={styles.pickerNotice}>
          Choose a recipe to add to your plan for {planDate} ({planSlot}).
        </p>
      )}
      <ul className={styles.grid}>
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link
              href={`/recipes/${recipe.id}?${new URLSearchParams(
                planDate && planSlot ? { planDate, planSlot } : {},
              ).toString()}`}
              className={styles.card}
            >
              <div className={styles.imageWrapper}>
                {recipe.imageUrl && (
                  <Image
                    src={recipe.imageUrl}
                    alt={recipe.title}
                    fill
                    sizes="(max-width: 600px) 50vw, 25vw"
                    className={styles.image}
                  />
                )}
              </div>
              <span className={styles.title}>{recipe.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <nav className={styles.pagination}>
        {page > 1 && (
          <Link href={`/recipes?page=${page - 1}${planParams}`}>
            &larr; Previous
          </Link>
        )}
        <span>
          Page {page} of {totalPages}
        </span>
        {page < totalPages && (
          <Link href={`/recipes?page=${page + 1}${planParams}`}>
            Next &rarr;
          </Link>
        )}
      </nav>
    </div>
  );
}
