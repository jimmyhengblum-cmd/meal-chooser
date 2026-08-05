import Link from "next/link";
import Image from "next/image";
import { getWeekPlan } from "@/lib/plan";
import { removeFromPlan } from "./actions";
import { generateFromWeek } from "@/app/grocery-list/actions";
import {
  MEAL_SLOTS,
  addDays,
  formatDate,
  parseDate,
  startOfWeek,
  weekDates,
} from "@/lib/week";
import styles from "./page.module.css";

const SLOT_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const DAY_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export default async function PlanPage(props: PageProps<"/plan">) {
  const searchParams = await props.searchParams;
  const weekParam = Array.isArray(searchParams.week)
    ? searchParams.week[0]
    : searchParams.week;

  const weekStart = startOfWeek(weekParam ? parseDate(weekParam) : new Date());
  const days = weekDates(weekStart);
  const entries = await getWeekPlan(weekStart);

  const entryFor = (date: string, slot: string) =>
    entries.find((e) => e.plannedDate === date && e.mealSlot === slot);

  const weekParamValue = formatDate(weekStart);
  const prevWeek = formatDate(addDays(weekStart, -7));
  const nextWeek = formatDate(addDays(weekStart, 7));

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <h1>Meal plan</h1>
        <nav className={styles.weekNav}>
          <Link href={`/plan?week=${prevWeek}`}>&larr; Previous week</Link>
          <Link href={`/plan?week=${nextWeek}`}>Next week &rarr;</Link>
        </nav>
        <form action={generateFromWeek}>
          <input type="hidden" name="week" value={weekParamValue} />
          <button type="submit" className={styles.generateButton}>
            Generate grocery list
          </button>
        </form>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              {days.map((day) => (
                <th key={formatDate(day)}>{DAY_FORMATTER.format(day)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_SLOTS.map((slot) => (
              <tr key={slot}>
                <th scope="row">{SLOT_LABELS[slot]}</th>
                {days.map((day) => {
                  const date = formatDate(day);
                  const entry = entryFor(date, slot);

                  return (
                    <td key={date}>
                      {entry ? (
                        <div className={styles.cell}>
                          <Link
                            href={`/recipes/${entry.recipe.id}`}
                            className={styles.recipeLink}
                          >
                            {entry.recipe.imageUrl && (
                              <div className={styles.thumbnail}>
                                <Image
                                  src={entry.recipe.imageUrl}
                                  alt={entry.recipe.title}
                                  fill
                                  sizes="80px"
                                  className={styles.thumbnailImage}
                                />
                              </div>
                            )}
                            <span>{entry.recipe.title}</span>
                          </Link>
                          <form action={removeFromPlan}>
                            <input type="hidden" name="entryId" value={entry.id} />
                            <input type="hidden" name="week" value={weekParamValue} />
                            <button type="submit" className={styles.remove}>
                              Remove
                            </button>
                          </form>
                        </div>
                      ) : (
                        <Link
                          href={`/recipes?planDate=${date}&planSlot=${slot}`}
                          className={styles.addLink}
                        >
                          + Add
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
