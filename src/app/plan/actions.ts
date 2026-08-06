"use server";

import { redirect } from "next/navigation";
import {
  assignRecipeToPlan,
  clearWeekPlan,
  generateWeekPlan,
  removePlanEntry,
  rerollWeekPlan,
} from "@/lib/plan";
import { MEAL_SLOTS, formatDate, startOfWeek, parseDate, type MealSlot } from "@/lib/week";

function isMealSlot(value: string): value is MealSlot {
  return (MEAL_SLOTS as readonly string[]).includes(value);
}

export async function addToPlan(formData: FormData) {
  const plannedDate = String(formData.get("plannedDate") ?? "");
  const mealSlot = String(formData.get("mealSlot") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");

  if (!isMealSlot(mealSlot)) throw new Error("Invalid meal slot");

  await assignRecipeToPlan(plannedDate, mealSlot, recipeId);

  const week = formatDate(startOfWeek(parseDate(plannedDate)));
  redirect(`/plan?week=${week}`);
}

export async function removeFromPlan(formData: FormData) {
  const entryId = String(formData.get("entryId") ?? "");
  const week = String(formData.get("week") ?? "");

  await removePlanEntry(entryId);

  redirect(`/plan?week=${week}`);
}

export async function generateWeek(formData: FormData) {
  const week = String(formData.get("week") ?? "");

  await generateWeekPlan(parseDate(week));

  redirect(`/plan?week=${week}`);
}

export async function rerollWeek(formData: FormData) {
  const week = String(formData.get("week") ?? "");

  await rerollWeekPlan(parseDate(week));

  redirect(`/plan?week=${week}`);
}

export async function clearWeek(formData: FormData) {
  const week = String(formData.get("week") ?? "");

  await clearWeekPlan(parseDate(week));

  redirect(`/plan?week=${week}`);
}
