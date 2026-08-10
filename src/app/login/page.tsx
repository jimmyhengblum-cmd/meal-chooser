"use client";

import { useActionState } from "react";
import { sendOtpCode, verifyOtpCode } from "./actions";
import styles from "../auth.module.css";

export default function LoginPage() {
  const [sendState, sendAction, sendPending] = useActionState(sendOtpCode, null);
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyOtpCode,
    null,
  );

  const email = sendState && "sent" in sendState ? sendState.email : null;
  const sendError = sendState && "error" in sendState ? sendState.error : null;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Sign in</h1>
        {email ? (
          <>
            <p className={styles.notice}>
              We sent a 6-digit code to {email}. Enter it below to sign in.
            </p>
            <form action={verifyAction} className={styles.form}>
              <input type="hidden" name="email" value={email} />
              <label className={styles.field}>
                Code
                <input
                  type="text"
                  name="token"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                />
              </label>
              {verifyState?.error && (
                <p className={styles.error}>{verifyState.error}</p>
              )}
              <button
                className={styles.submit}
                type="submit"
                disabled={verifyPending}
              >
                {verifyPending ? "Verifying…" : "Verify code"}
              </button>
            </form>
            <form action={sendAction}>
              <input type="hidden" name="email" value={email} />
              <button
                className={styles.linkButton}
                type="submit"
                disabled={sendPending}
              >
                {sendPending ? "Resending…" : "Resend code"}
              </button>
            </form>
            <a className={styles.notice} href="/login">
              Use a different email
            </a>
          </>
        ) : (
          <form action={sendAction} className={styles.form}>
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
            {sendError && <p className={styles.error}>{sendError}</p>}
            <button className={styles.submit} type="submit" disabled={sendPending}>
              {sendPending ? "Sending…" : "Send code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
