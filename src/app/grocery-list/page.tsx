import Link from "next/link";
import { getGroceryList } from "@/lib/groceryList";
import { GroceryItemGroup } from "./GroceryItemGroup";
import styles from "./page.module.css";

export default async function GroceryListPage() {
  const groups = await getGroceryList();

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <h1>Grocery list</h1>
        <div className={styles.toolbarLinks}>
          {groups.length > 0 && (
            <a href="/grocery-list/export">Export as prompt (.txt)</a>
          )}
          <Link href="/plan">Back to meal plan</Link>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className={styles.empty}>
          No items yet. Generate a list from your{" "}
          <Link href="/plan">meal plan</Link>.
        </p>
      ) : (
        <ul className={styles.list}>
          {groups.map((group) => (
            <GroceryItemGroup key={group.ingredientId} group={group} />
          ))}
        </ul>
      )}
    </div>
  );
}
