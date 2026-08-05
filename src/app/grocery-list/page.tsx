import Link from "next/link";
import { getGroceryList } from "@/lib/groceryList";
import { GroceryItemRow } from "./GroceryItemRow";
import styles from "./page.module.css";

export default async function GroceryListPage() {
  const items = await getGroceryList();

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <h1>Grocery list</h1>
        <Link href="/plan">Back to meal plan</Link>
      </div>
      {items.length === 0 ? (
        <p className={styles.empty}>
          No items yet. Generate a list from your{" "}
          <Link href="/plan">meal plan</Link>.
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <GroceryItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
