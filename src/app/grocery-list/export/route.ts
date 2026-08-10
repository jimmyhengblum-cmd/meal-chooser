import { getGroceryListExportPrompt } from "@/lib/groceryList";

export async function GET() {
  const text = await getGroceryListExportPrompt();

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="liste-de-courses.txt"',
    },
  });
}
