import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className={styles.page}>
      <h1>Welcome{user?.email ? `, ${user.email}` : ""}</h1>
      <p>
        Build your <Link href="/plan">weekly meal plan</Link> from the{" "}
        <Link href="/recipes">recipes</Link>, then generate your{" "}
        <Link href="/grocery-list">grocery list</Link>.
      </p>
    </div>
  );
}
