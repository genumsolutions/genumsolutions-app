// =====================================================================
// cartAvailability - the app-side mirror of the website's checkout rules
// (website: app/checkout/page.tsx + lib/checkout.ts priceRequestedItems).
//
// A cart line is only purchasable when the product is active, is not a
// quote-only Project package, has stock, and has a real price. Quantity is
// clamped to the available stock. Keeping this in one pure module means the
// cart and checkout can never disagree about what is buyable.
// =====================================================================
import type { Product } from "../types";

export type LineIssue = "missing" | "hidden" | "quote-only" | "out-of-stock";

export const LINE_ISSUE_LABELS: Record<LineIssue, string> = {
  missing: "No longer listed",
  hidden: "No longer available",
  "quote-only": "Quote-only package — request a quote instead",
  "out-of-stock": "Out of stock",
};

/** Why a product cannot be bought directly, or null when it can. */
export function lineIssue(
  product: Product | undefined | null,
): LineIssue | null {
  if (!product) return "missing";
  if (product.active === false) return "hidden";
  if (product.productType === "Project package") return "quote-only";
  if ((product.stock ?? 0) <= 0 || (product.price ?? 0) <= 0)
    return "out-of-stock";
  return null;
}

/** Clamp a requested quantity into [1, stock] for a purchasable product. */
export function clampToStock(quantity: number, stock: number): number {
  const cap = Math.max(1, Math.floor(Number(stock) || 0));
  return Math.max(1, Math.min(Math.max(1, Math.floor(quantity)), cap));
}
