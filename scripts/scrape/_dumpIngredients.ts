import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { writeFileSync } from "fs";
import { createAdminClient } from "./supabaseAdmin";

const PAGE_SIZE = 1000;

async function main() {
  const admin = createAdminClient();
  const all: { id: string; name: string; name_fr: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("ingredients")
      .select("id, name, name_fr")
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const outPath = process.argv[2];
  writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`wrote ${all.length} ingredients to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
