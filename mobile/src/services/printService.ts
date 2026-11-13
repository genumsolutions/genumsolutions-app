// =====================================================================
// printService — the app side of the 3D print studio.
//
// The website owns the print content (categories, materials, rates,
// promotions, gallery) and the quote pipeline; the app reads it through the
// public `/api/print` route and submits requests to `/api/print/quote`, which
// validates, rate-limits and stores them as `print_quote_requests` rows.
//
// Why the website and not Supabase directly: the quote route owns validation,
// rate limiting and the private file bucket, and it emails the workshop. The
// app only ships the anon key, so writing the table directly would bypass all
// of that (and the table has no anon insert policy anyway).
//
// Every network failure degrades to the bundled fallback content — the screen
// still renders the service copy, just without live rates or a promotion.
// =====================================================================
import { logger } from "./logger";

const WEBSITE_URL = "https://genumsolutions-website.vercel.app";
const REQUEST_TIMEOUT_MS = 8000;

export type PrintMaterial = {
  id: string;
  name: string;
  description: string;
  /** NPR per gram; 0 means "rate on request" (never shown as a price). */
  ratePerGram: number;
  note: string;
};

export type PrintPromotion = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  discountType: "none" | "percent" | "flat";
  discountValue: number;
};

export type PrintContent = {
  materials: PrintMaterial[];
  promotion: PrintPromotion | null;
  minimumOrder: number;
  designBaseCharge: number;
  calculatorEnabled: boolean;
};

/** Mirrors lib/print.ts on the website: no rates, no promotion, calc off. */
export const fallbackPrintContent: PrintContent = {
  materials: [
    {
      id: "pla",
      name: "PLA",
      description:
        "Crisp detail and easy to print — best for display models, teaching aids and prototypes.",
      ratePerGram: 0,
      note: "Rate on request.",
    },
    {
      id: "petg",
      name: "PETG",
      description:
        "Tougher and more heat/water resistant — a good fit for brackets, jigs and working parts.",
      ratePerGram: 0,
      note: "Rate on request.",
    },
  ],
  promotion: null,
  minimumOrder: 300,
  designBaseCharge: 2500,
  calculatorEnabled: false,
};

type ApiResponse = {
  settings?: {
    calculatorEnabled?: boolean;
    minimumOrder?: number;
    designBaseCharge?: number;
  };
  materials?: PrintMaterial[];
  promotions?: PrintPromotion[];
};

/** Live content from the website, with the bundled fallback on any failure. */
export async function getPrintContent(): Promise<{
  content: PrintContent;
  source: "live" | "fallback";
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${WEBSITE_URL}/api/print`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as ApiResponse;
    const materials = (data.materials ?? []).filter(
      (item) => item && typeof item.id === "string" && item.id.length > 0,
    );
    const promo = (data.promotions ?? [])[0] ?? null;
    return {
      source: "live",
      content: {
        materials:
          materials.length > 0 ? materials : fallbackPrintContent.materials,
        promotion: promo,
        minimumOrder:
          typeof data.settings?.minimumOrder === "number"
            ? data.settings.minimumOrder
            : fallbackPrintContent.minimumOrder,
        designBaseCharge:
          typeof data.settings?.designBaseCharge === "number"
            ? data.settings.designBaseCharge
            : fallbackPrintContent.designBaseCharge,
        calculatorEnabled: data.settings?.calculatorEnabled === true,
      },
    };
  } catch (error) {
    logger.warn("print", "print content fetch failed, using fallback", error);
    return { content: fallbackPrintContent, source: "fallback" };
  } finally {
    clearTimeout(timer);
  }
}

export type PrintQuoteInput = {
  name: string;
  email: string;
  phone?: string;
  material?: string;
  quantity: number;
  dimensions?: string;
  timeline?: string;
  description: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same limits the website route enforces, checked before the round trip. */
export function validatePrintQuote(
  input: PrintQuoteInput,
):
  | { ok: true; value: PrintQuoteInput & { quantity: number } }
  | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim();
  const description = String(input.description ?? "").trim();
  const rawQuantity = Number(input.quantity);
  // Mirror the route: a real 0 is invalid, a missing value becomes 1.
  const quantity = Number.isFinite(rawQuantity) ? Math.floor(rawQuantity) : 1;
  if (!name) return { ok: false, error: "Please add your name." };
  if (name.length > 100)
    return { ok: false, error: "Please shorten your name." };
  if (!EMAIL.test(email) || email.length > 254)
    return { ok: false, error: "Please check your email address." };
  if (description.length < 10)
    return {
      ok: false,
      error: "Tell us a little more about the part you need.",
    };
  if (description.length > 4000)
    return { ok: false, error: "Please shorten the description." };
  if (String(input.phone ?? "").length > 30)
    return { ok: false, error: "Please shorten your phone number." };
  if (quantity < 1 || quantity > 10000)
    return { ok: false, error: "Quantity must be between 1 and 10,000." };
  return {
    ok: true,
    value: {
      name,
      email,
      description,
      quantity,
      phone: String(input.phone ?? "").trim(),
      material: String(input.material ?? "")
        .trim()
        .slice(0, 80),
      dimensions: String(input.dimensions ?? "")
        .trim()
        .slice(0, 120),
      timeline: String(input.timeline ?? "")
        .trim()
        .slice(0, 80),
    },
  };
}

export type PrintQuoteResult = { ok: true } | { ok: false; error: string };

/** Submit a text-only print request (attachments stay web-only for now). */
export async function submitPrintQuote(
  input: PrintQuoteInput,
): Promise<PrintQuoteResult> {
  const checked = validatePrintQuote(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${WEBSITE_URL}/api/print/quote`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(checked.value),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!response.ok || data.ok !== true) {
      return {
        ok: false,
        error:
          data.error ||
          "We could not send your request right now. Please try again, or email us the details.",
      };
    }
    return { ok: true };
  } catch (error) {
    logger.warn("print", "print quote submit failed", error);
    return {
      ok: false,
      error:
        "Could not reach the server. Check your connection and try again, or use the contact form.",
    };
  } finally {
    clearTimeout(timer);
  }
}
