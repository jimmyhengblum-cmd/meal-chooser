import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import styles from "./layout.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meal Chooser",
  description: "Pick meals for the week and generate grocery lists.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {user && (
          <header className={styles.header}>
            <nav className={styles.nav}>
              <Link href="/plan">Meal Plan</Link>
              <Link href="/recipes">Recipes</Link>
              <Link href="/grocery-list">Grocery List</Link>
            </nav>
            <div className={styles.account}>
              <span>{user.email}</span>
              <form action={signOut}>
                <button className={styles.signOut} type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
