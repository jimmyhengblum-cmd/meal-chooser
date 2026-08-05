"use client";

import { useActionState } from "react";
import { sendMagicLink } from "./actions";
import styles from "../auth.module.css";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, null);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Sign in</h1>
        {state && "sent" in state ? (
          <p className={styles.notice}>
            Check your email for a sign-in link.
          </p>
        ) : (
          <form action={formAction} className={styles.form}>
            <label className={styles.field}>
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
              />
            </label>
            {state?.error && <p className={styles.error}>{state.error}</p>}
            <button
              className={styles.submit}
              type="submit"
              disabled={pending}
            >
              {pending ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
