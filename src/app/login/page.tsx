"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "./actions";
import styles from "../auth.module.css";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signIn, null);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, null);

  const isSignIn = mode === "signin";
  const state = isSignIn ? signInState : signUpState;
  const pending = isSignIn ? signInPending : signUpPending;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{isSignIn ? "Sign in" : "Create an account"}</h1>
        <form
          action={isSignIn ? signInAction : signUpAction}
          className={styles.form}
        >
          <label className={styles.field}>
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              autoFocus
            />
          </label>
          <label className={styles.field}>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete={isSignIn ? "current-password" : "new-password"}
            />
          </label>
          {state?.error && <p className={styles.error}>{state.error}</p>}
          <button className={styles.submit} type="submit" disabled={pending}>
            {pending
              ? isSignIn
                ? "Signing in…"
                : "Creating account…"
              : isSignIn
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        <button
          className={styles.linkButton}
          type="button"
          onClick={() => setMode(isSignIn ? "signup" : "signin")}
        >
          {isSignIn
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
