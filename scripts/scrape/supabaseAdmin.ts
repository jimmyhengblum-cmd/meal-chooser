import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local.example).",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}
