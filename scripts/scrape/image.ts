import type { SupabaseClient } from "@supabase/supabase-js";
import { USER_AGENT } from "./sites";
import { httpGet } from "./httpClient";
import type { Database } from "../../src/lib/supabase/types";

const BUCKET = "recipe-images";

function slugFromUrl(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  return path.split("/").pop() || "recipe";
}

function extFromUrl(url: string): string {
  const match = /\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i.exec(url);
  return match ? match[1].toLowerCase() : "jpg";
}

// Downloads the recipe's hero image and uploads it to Supabase Storage so
// display doesn't depend on hotlinking the source site. Returns the storage
// object path (relative to the bucket), or null if there's no image or the
// download/upload fails (non-fatal — the recipe is still saved).
export async function downloadAndStoreImage(
  admin: SupabaseClient<Database>,
  siteId: string,
  sourceUrl: string,
  imageUrl: string | null,
): Promise<string | null> {
  if (!imageUrl) return null;

  const res = await httpGet(imageUrl, { "User-Agent": USER_AGENT });
  if (res.status !== 200) {
    console.warn(`  image download failed (${res.status}): ${imageUrl}`);
    return null;
  }
  const contentType =
    (Array.isArray(res.headers["content-type"])
      ? res.headers["content-type"][0]
      : res.headers["content-type"]) ?? "image/jpeg";
  const path = `${siteId}/${slugFromUrl(sourceUrl)}.${extFromUrl(imageUrl)}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, res.body, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.warn(`  image upload failed: ${error.message}`);
    return null;
  }
  return path;
}
