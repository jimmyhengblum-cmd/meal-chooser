"use client";

import type { GroceryListGroup } from "@/lib/groceryList";
import { formatQuantity } from "@/lib/format";
import { toggleItem, removeItem } from "./actions";
import styles from "./page.module.css";

export function GroceryItemGroup({ group }: { group: GroceryListGroup }) {
  const allChecked = group.lines.every((line) => line.checked);

  return (
    <li className={styles.row}>
      <form
        action={toggleItem}
        onChange={(e) => e.currentTarget.requestSubmit()}
        className={styles.checkForm}
      >
        <input
          type="hidden"
          name="itemIds"
          value={group.lines.map((line) => line.id).join(",")}
        />
        <input type="hidden" name="checked" value={String(!allChecked)} />
        <label className={styles.label}>
          <input type="checkbox" defaultChecked={allChecked} />
          <span className={allChecked ? styles.checked : undefined}>
            {group.name}
          </span>
        </label>
      </form>
      <div className={styles.quantities}>
        {group.lines.map((line) => {
          const text = [
            line.quantity != null ? formatQuantity(line.quantity) : null,
            line.unit,
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <form
              action={removeItem}
              key={line.id}
              className={styles.quantityChip}
            >
              <input type="hidden" name="itemId" value={line.id} />
              {text && (
                <span className={line.checked ? styles.checked : undefined}>
                  {text}
                </span>
              )}
              <button
                type="submit"
                className={styles.chipRemove}
                aria-label={`Remove ${text || group.name}`}
              >
                ×
              </button>
            </form>
          );
        })}
      </div>
    </li>
  );
}
