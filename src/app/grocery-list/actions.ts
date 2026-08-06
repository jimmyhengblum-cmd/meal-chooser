"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  removeGroceryItem,
  setItemChecked,
  generateGroceryListFromWeek,
} from "@/lib/groceryList";
import { startOfWeek, parseDate } from "@/lib/week";

export async function toggleItem(formData: FormData) {
  const itemIds = String(formData.get("itemIds") ?? "")
    .split(",")
    .filter(Boolean);
  const checked = formData.get("checked") === "true";

  await Promise.all(itemIds.map((id) => setItemChecked(id, checked)));
  revalidatePath("/grocery-list");
}

export async function removeItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");

  await removeGroceryItem(itemId);
  revalidatePath("/grocery-list");
}

export async function generateFromWeek(formData: FormData) {
  const week = String(formData.get("week") ?? "");

  await generateGroceryListFromWeek(startOfWeek(parseDate(week)));
  redirect("/grocery-list");
}
