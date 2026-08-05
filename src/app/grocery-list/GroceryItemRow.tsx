"use client";

import type { GroceryListItem } from "@/lib/groceryList";
import { formatQuantity } from "@/lib/format";
import { toggleItem, removeItem } from "./actions";
import styles from "./page.module.css";

export function GroceryItemRow({ item }: { item: GroceryListItem }) {
  return (
    <li className={styles.row}>
      <form
        action={toggleItem}
        onChange={(e) => e.currentTarget.requestSubmit()}
        className={styles.checkForm}
      >
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="checked" value={String(item.checked)} />
        <label className={styles.label}>
          <input type="checkbox" name="toggle" defaultChecked={item.checked} />
          <span className={item.checked ? styles.checked : undefined}>
            {item.quantity != null &&
              `${formatQuantity(item.quantity)}${item.unit ? " " + item.unit : ""} `}
            {item.name}
          </span>
        </label>
      </form>
      <form action={removeItem}>
        <input type="hidden" name="itemId" value={item.id} />
        <button type="submit" className={styles.remove}>
          Remove
        </button>
      </form>
    </li>
  );
}
