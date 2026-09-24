// =====================================================================
// newsletterService — A3 (2026-09-24): the app mirror of the website's
// newsletter capture (web: POST /api/newsletter → newsletter_subscribers).
//
// Goes through the `newsletter-subscribe` edge function so the same
// server-side validation + rate limit applies on native as on web
// (the app only ships the anon key — RLS alone would allow unbounded
// anonymous inserts). The caller's Supabase JWT rides along; guests can
// subscribe too (the edge rate-limits by token).
// =====================================================================
import { supabase } from "../config/supabase";
import { logger } from "./logger";

export type NewsletterSource = "app-account" | "app-checkout";

export type SubscribeResult =
  { ok: true; email: string } | { ok: false; error: string };

const EDGE = "newsletter-subscribe";

/** Subscribe an email (idempotent: re-subscribing refreshes source/status). */
export async function subscribeToNewsletter(
  email: string,
  source: NewsletterSource = "app-account",
): Promise<SubscribeResult> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const { data, error } = await supabase.functions.invoke(EDGE, {
      body: { email: clean, source },
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (error) {
      // functions.invoke surfaces edge errors as FunctionsHttpError with the
      // body in context on newer clients; fall back to a generic message.
      const message =
        (error as unknown as { context?: { error?: string } })?.context
          ?.error ??
        error.message ??
        "Could not subscribe right now.";
      return { ok: false, error: message };
    }
    if (data && typeof data === "object" && "error" in data) {
      return { ok: false, error: String((data as { error: unknown }).error) };
    }
    return { ok: true, email: clean };
  } catch (e) {
    logger.error("newsletter", "subscribe failed", e);
    return { ok: false, error: "Could not subscribe right now." };
  }
}
