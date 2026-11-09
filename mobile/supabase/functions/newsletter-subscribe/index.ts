// =====================================================================
// newsletter-subscribe — A3 (2026-09-24): the APP's newsletter capture,
// mirroring the website's POST /api/newsletter (same table, same rules).
//
// Why an edge function: the web route validates + rate-limits server-side
// using server-only env. The app ships only the anon key, so RLS alone
// would allow unbounded anonymous inserts. This function provides the same
// server-side guardrails for native clients:
//   • POST { email, source }  → validated, rate-limited, idempotent upsert
//   • GET                     → staff+ paged list (admin Messages mirror)
//   • DELETE ?email=          → admin+ remove (admin Messages mirror)
//
// Table: newsletter_subscribers (unique lowercase email, source, status).
// RLS: insert-open (self-capture), read/update staff+, delete admin+.
// Client auth: the caller's JWT (anon or user) — same as the web route's
// browser session. verify_jwt stays ON (the app calls this WITH headers).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SOURCES = new Set(["footer", "checkout", "app-account", "app-checkout"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    },
  });
}

/** Simple in-memory rate limit (per anon/user key): 20/min, like the web route. */
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(key) ?? []).filter((t) => t > windowStart);
  list.push(now);
  hits.set(key, list);
  return list.length > 20;
}

async function callerAuth(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { token: "", role: "anon" as const };
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return { token, role: "anon" as const };
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  const role = (profile?.role as string) || "customer";
  return { token, role, userId: data.user.id, authHeader };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  try {
    const auth = await callerAuth(req);

    if (req.method === "POST") {
      const rateKey = auth.userId ?? auth.token.slice(-24) ?? "anon";
      if (rateLimited(rateKey))
        return json(
          { error: "Too many attempts. Try again in a minute." },
          429,
        );

      const body = (await req.json().catch(() => null)) as {
        email?: unknown;
        source?: unknown;
      } | null;
      const email = String(body?.email ?? "")
        .trim()
        .toLowerCase();
      const source = String(body?.source ?? "app-account");
      if (!EMAIL_RE.test(email) || email.length > 254)
        return json({ error: "Please enter a valid email address." }, 400);
      if (!SOURCES.has(source)) return json({ error: "Invalid source." }, 400);

      // Idempotent subscribe — same contract as the web route: re-subscribing
      // refreshes source/status, never duplicates. Uses the SERVICE role
      // client because the RLS UPDATE policy is staff-only (a public upsert
      // with the anon key violates RLS the moment the email already exists),
      // while the public INSERT policy is exactly what the web route's
      // service-role write mirrors. All validation + rate limiting happened
      // above, and the write is a fixed-shape self-capture (email/source/
      // status) — the caller cannot widen it.
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const { error } = await admin.from("newsletter_subscribers").upsert(
        {
          email,
          source,
          status: "subscribed",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );
      if (error) return json({ error: "Could not subscribe right now." }, 500);
      return json({ ok: true, email, source }, 201);
    }

    if (req.method === "GET") {
      if (!["staff", "admin", "owner"].includes(auth.role))
        return json({ error: "Staff access required." }, 403);
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const url = new URL(req.url);
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const limit = Math.min(
        100,
        Math.max(5, Number(url.searchParams.get("limit") || 20)),
      );
      const { data, error } = await admin
        .from("newsletter_subscribers")
        .select("email, source, status, created_at")
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (error) return json({ error: "Could not load subscribers." }, 500);
      return json({ subscribers: data ?? [], page, limit });
    }

    if (req.method === "DELETE") {
      if (!["admin", "owner"].includes(auth.role))
        return json({ error: "Admin access required." }, 403);
      const email = (new URL(req.url).searchParams.get("email") || "")
        .trim()
        .toLowerCase();
      if (!EMAIL_RE.test(email))
        return json({ error: "A valid email is required." }, 400);
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const { error } = await admin
        .from("newsletter_subscribers")
        .delete()
        .eq("email", email);
      if (error)
        return json({ error: "Could not remove the subscriber." }, 500);
      return json({ ok: true });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    console.error("newsletter-subscribe error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
