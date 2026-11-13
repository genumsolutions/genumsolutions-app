// =====================================================================
// projectPricingService — public read of one project package's pricing.
//
// The row lives in public.project_pricing and is shared with the website
// (same Supabase project). It is read directly with the anon key, the same
// way the app reads products and project components — no website API hop, so
// the app keeps working when the website is not reachable.
//
// Only APPROVED rows may reach a customer: the table's public read policy
// already hides drafts from anonymous users, but a signed-in STAFF user also
// matches the staff read policy, so the query filters `price_status` itself.
// Anything unexpected (missing row, offline, RLS denial) returns null and the
// screen shows "rate on request".
// =====================================================================
import { supabase, supabaseConfigured } from "../config/supabase";
import {
  publishedProjectPricing,
  type ProjectPricing,
  type ProjectPricingBulkTier,
  type ProjectPricingExtra,
} from "../lib/project-pricing";
import { logger } from "./logger";

type RawRow = Record<string, unknown>;

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** snake_case row → camelCase pricing object (shared by the admin reads too). */
export function mapProjectPricingRow(
  row: RawRow | null,
): ProjectPricing | null {
  if (!row) return null;
  const rawExtras = Array.isArray(row.extras) ? row.extras : [];
  const rawTiers = Array.isArray(row.bulk_tiers) ? row.bulk_tiers : [];
  return {
    id: str(row.id),
    packageBaseCharge: Math.max(0, num(row.package_base_charge, 0)),
    componentMarkupPercent: Math.min(
      500,
      Math.max(0, num(row.component_markup_percent, 0)),
    ),
    extras: rawExtras
      .filter(
        (extra): extra is RawRow => typeof extra === "object" && extra !== null,
      )
      .map((extra): ProjectPricingExtra => ({
        id: str(extra.id, str(extra.name)),
        name: str(extra.name),
        amount: Math.max(0, num(extra.amount, 0)),
      }))
      .slice(0, 20),
    bulkTiers: rawTiers
      .filter(
        (tier): tier is RawRow => typeof tier === "object" && tier !== null,
      )
      .map((tier): ProjectPricingBulkTier => ({
        minQty: Math.max(1, num(tier.minQty, 1)),
        discountPercent: Math.min(
          90,
          Math.max(0, num(tier.discountPercent, 0)),
        ),
      }))
      .slice(0, 10),
    minimumOrder: Math.max(0, num(row.minimum_order, 0)),
    priceStatus: row.price_status === "approved" ? "approved" : "draft",
    priceApprovedAt:
      typeof row.price_approved_at === "string" ? row.price_approved_at : null,
    priceApprovedBy: str(row.price_approved_by),
    note: str(row.note),
    updatedAt: str(row.updated_at, new Date(0).toISOString()),
  };
}

/**
 * The published (approved) pricing row for a project package, or null.
 * Never throws — a failure means "rate on request" on the detail page.
 */
export async function getPublishedProjectPricing(
  projectId: string,
): Promise<ProjectPricing | null> {
  if (!supabaseConfigured || !projectId) return null;
  try {
    const { data, error } = await supabase
      .from("project_pricing")
      .select("*")
      .eq("id", projectId)
      .eq("price_status", "approved")
      .maybeSingle();
    if (error) throw error;
    const mapped = mapProjectPricingRow(data as RawRow | null);
    return mapped ? publishedProjectPricing(mapped) : null;
  } catch (error) {
    logger.warn(
      "pricing",
      `project pricing read failed for ${projectId}`,
      error,
    );
    return null;
  }
}
