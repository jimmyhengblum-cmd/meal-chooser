"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SendCodeState = { error: string } | { sent: true; email: string } | null;
export type VerifyCodeState = { error: string } | null;

export async function sendOtpCode(
  _prevState: SendCodeState,
  formData: FormData,
): Promise<SendCodeState> {
  const email = String(formData.get("email") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return { error: error.message };
  }

  return { sent: true, email };
}

export async function verifyOtpCode(
  _prevState: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
