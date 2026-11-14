// =====================================================================
// printAdminService — the app side of the 3D print studio admin.
//
// Mirrors the website's AdminPrint panel (components/admin/AdminPrint.tsx)
// and its API route. Reads and writes go straight to Supabase because the
// print_* tables grant staff-write RLS policies, same as the project pricing
// admin. Draft rows are visible to staff only, so the app sees what the owner
// is editing while customers still see approved content.
//
// INTERNAL: `costing` is staff-only (no public read policy at all) and must
// never be rendered on a customer surface.
// =====================================================================
import { supabase } from "../config/supabase";
import {
  defaultPrintCosting,
  quoteMargin,
  costingStatus,
  billedGramCost,
  type PrintCosting,
} from "../lib/print-costing";

export type PrintSettings = {
  calculatorEnabled: boolean;
  minimumOrder: number;
  designBaseCharge: number;
  finishingCharges: { id: string; name: string; amount: number }[];
  bulkTiers: { minQty: number; discountPercent: number }[];
  disclaimer: string;
  heroImage: string;
  materialsIntro: string;
  pricingStatus: "draft" | "approved";
  pricingApprovedAt: string | null;
  pricingApprovedBy: string;
};

/** Mirrors the website's defaultPrintSettings: nothing published, calc off. */
export const defaultPrintSettings: PrintSettings = {
  calculatorEnabled: false,
  minimumOrder: 300,
  designBaseCharge: 2500,
  finishingCharges: [],
  bulkTiers: [],
  disclaimer: "",
  heroImage: "",
  materialsIntro: "",
  pricingStatus: "draft",
  pricingApprovedAt: null,
  pricingApprovedBy: "",
};

export type PrintCategory = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  active: boolean;
};

export type PrintMaterial = {
  id: string;
  name: string;
  description: string;
  ratePerGram: number;
  note: string;
  sortOrder: number;
  active: boolean;
};

export type PrintPromotion = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  discountType: "none" | "percent" | "flat";
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  sortOrder: number;
};

export type PrintGalleryItem = {
  id: string;
  imageUrl: string;
  caption: string;
  category: string;
  featured: boolean;
  active: boolean;
  sortOrder: number;
};

export type PrintServiceItem = {
  id: string;
  title: string;
  description: string;
  priceNote: string;
  sortOrder: number;
  active: boolean;
};

export const PRINT_QUOTE_STATUSES = [
  "new",
  "reviewing",
  "needs_info",
  "quoted",
  "approved",
  "printing",
  "ready",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type PrintQuoteStatus = (typeof PRINT_QUOTE_STATUSES)[number];

export const PRINT_QUOTE_STATUS_LABELS: Record<PrintQuoteStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  needs_info: "Info needed",
  quoted: "Quoted",
  approved: "Approved",
  printing: "Printing",
  ready: "Ready",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Statuses that produced work someone paid for (revenue basis). */
export const PRINT_QUOTE_WON_STATUSES: PrintQuoteStatus[] = [
  "approved",
  "printing",
  "ready",
  "completed",
];

export type PrintQuote = {
  id: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  material: string;
  quantity: number;
  dimensions: string;
  timeline: string;
  status: PrintQuoteStatus;
  adminNotes: string;
  quotedAmount: number;
  estimatedGrams: number;
  printHours: number;
  reprint: boolean;
  createdAt: string;
};

export type PrintAdminData = {
  settings: PrintSettings;
  categories: PrintCategory[];
  materials: PrintMaterial[];
  promotions: PrintPromotion[];
  gallery: PrintGalleryItem[];
  services: PrintServiceItem[];
  costing: PrintCosting;
  quotes: PrintQuote[];
};

export type PrintReportStat = { label: string; value: string; note: string };

const number = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

function failure(error: unknown, fallback: string): Error {
  const message = (error as { message?: string })?.message;
  return new Error(message || fallback);
}

// ── row mappers ──────────────────────────────────────────────────────

export function mapPrintSettingsRow(
  row: Record<string, unknown> | null,
): PrintSettings {
  if (!row) return { ...defaultPrintSettings };
  const charges = Array.isArray(row.finishing_charges)
    ? row.finishing_charges
    : [];
  const tiers = Array.isArray(row.bulk_tiers) ? row.bulk_tiers : [];
  return {
    calculatorEnabled: bool(row.calculator_enabled),
    minimumOrder: Math.max(
      0,
      number(row.minimum_order, defaultPrintSettings.minimumOrder),
    ),
    designBaseCharge: Math.max(
      0,
      number(row.design_base_charge, defaultPrintSettings.designBaseCharge),
    ),
    finishingCharges: charges
      .map((entry) => {
        const charge = (entry ?? {}) as Record<string, unknown>;
        return {
          id: text(charge.id) || text(charge.name),
          name: text(charge.name).slice(0, 60),
          amount: Math.max(0, Math.round(number(charge.amount))),
        };
      })
      .filter((charge) => charge.name.length > 0),
    bulkTiers: tiers
      .map((entry) => {
        const tier = (entry ?? {}) as Record<string, unknown>;
        return {
          minQty: Math.max(1, Math.round(number(tier.minQty, 1))),
          discountPercent: Math.min(
            90,
            Math.max(0, Math.round(number(tier.discountPercent))),
          ),
        };
      })
      .filter((tier) => tier.minQty > 0),
    disclaimer: text(row.disclaimer),
    heroImage: text(row.hero_image),
    materialsIntro: text(row.materials_intro),
    pricingStatus:
      text(row.pricing_status) === "approved" ? "approved" : "draft",
    pricingApprovedAt: row.pricing_approved_at
      ? String(row.pricing_approved_at)
      : null,
    pricingApprovedBy: text(row.pricing_approved_by),
  };
}

export function mapPrintQuoteRow(row: Record<string, unknown>): PrintQuote {
  const status = text(row.status, "new") as PrintQuoteStatus;
  return {
    id: String(row.id ?? ""),
    name: text(row.name),
    email: text(row.email),
    phone: text(row.phone),
    description: text(row.description),
    material: text(row.material),
    quantity: Math.max(1, number(row.quantity, 1)),
    dimensions: text(row.dimensions),
    timeline: text(row.timeline),
    status: PRINT_QUOTE_STATUSES.includes(status) ? status : "new",
    adminNotes: text(row.admin_notes),
    quotedAmount: Math.max(0, number(row.quoted_amount)),
    estimatedGrams: Math.max(0, number(row.estimated_grams)),
    printHours: Math.max(0, number(row.print_hours)),
    reprint: bool(row.reprint),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Row shape for a save. Approval is NOT writable here — see setPrintApproval. */
function toPrintSettingsRow(settings: PrintSettings) {
  return {
    id: 1,
    calculator_enabled: settings.calculatorEnabled,
    minimum_order: Math.max(0, Math.round(number(settings.minimumOrder))),
    design_base_charge: Math.max(
      0,
      Math.round(number(settings.designBaseCharge)),
    ),
    finishing_charges: settings.finishingCharges
      .filter((charge) => charge.name.trim().length > 0)
      .map((charge) => ({
        id: charge.id || charge.name,
        name: charge.name.slice(0, 60),
        amount: Math.max(0, Math.round(number(charge.amount))),
      }))
      .slice(0, 20),
    bulk_tiers: settings.bulkTiers
      .filter((tier) => tier.minQty > 0)
      .map((tier) => ({
        minQty: Math.max(1, Math.round(number(tier.minQty, 1))),
        discountPercent: Math.min(
          90,
          Math.max(0, Math.round(number(tier.discountPercent))),
        ),
      }))
      .slice(0, 10),
    disclaimer: settings.disclaimer.slice(0, 2000),
    hero_image: settings.heroImage.slice(0, 500),
    materials_intro: settings.materialsIntro.slice(0, 1000),
    updated_at: new Date().toISOString(),
  };
}

// ── reads ────────────────────────────────────────────────────────────

/** Everything the print admin needs, drafts included (staff-only RLS). */
export async function loadPrintAdminData(): Promise<PrintAdminData> {
  const [
    settings,
    categories,
    materials,
    promotions,
    gallery,
    services,
    costing,
    quotes,
  ] = await Promise.all([
    supabase.from("print_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("print_categories").select("*").order("sort_order"),
    supabase.from("print_materials").select("*").order("sort_order"),
    supabase.from("print_promotions").select("*").order("sort_order"),
    supabase.from("print_gallery").select("*").order("sort_order"),
    supabase.from("print_services").select("*").order("sort_order"),
    supabase.from("print_costing").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("print_quote_requests")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const firstError = [
    settings.error,
    categories.error,
    materials.error,
    promotions.error,
    gallery.error,
    services.error,
    costing.error,
    quotes.error,
  ].find(Boolean);
  if (firstError)
    throw failure(firstError, "Could not load the 3D print content.");

  const costingRow = (costing.data ?? null) as Record<string, unknown> | null;
  return {
    settings: mapPrintSettingsRow(
      (settings.data ?? null) as Record<string, unknown> | null,
    ),
    categories: ((categories.data ?? []) as Record<string, unknown>[]).map(
      (row) => ({
        id: String(row.id ?? ""),
        name: text(row.name),
        description: text(row.description),
        imageUrl: text(row.image_url),
        sortOrder: number(row.sort_order, 1000),
        active: bool(row.active, true),
      }),
    ),
    materials: ((materials.data ?? []) as Record<string, unknown>[]).map(
      (row) => ({
        id: String(row.id ?? ""),
        name: text(row.name),
        description: text(row.description),
        ratePerGram: Math.max(0, number(row.rate_per_gram)),
        note: text(row.note),
        sortOrder: number(row.sort_order, 1000),
        active: bool(row.active, true),
      }),
    ),
    promotions: ((promotions.data ?? []) as Record<string, unknown>[]).map(
      (row) => ({
        id: String(row.id ?? ""),
        title: text(row.title),
        body: text(row.body),
        imageUrl: text(row.image_url),
        ctaLabel: text(row.cta_label),
        ctaHref: text(row.cta_href),
        discountType:
          text(row.discount_type) === "percent"
            ? "percent"
            : text(row.discount_type) === "flat"
              ? "flat"
              : "none",
        discountValue: Math.max(0, number(row.discount_value)),
        startsAt: row.starts_at ? String(row.starts_at) : null,
        endsAt: row.ends_at ? String(row.ends_at) : null,
        active: bool(row.active),
        sortOrder: number(row.sort_order, 1000),
      }),
    ),
    gallery: ((gallery.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ""),
      imageUrl: text(row.image_url),
      caption: text(row.caption),
      category: text(row.category),
      featured: bool(row.featured),
      active: bool(row.active, true),
      sortOrder: number(row.sort_order, 1000),
    })),
    services: ((services.data ?? []) as Record<string, unknown>[]).map(
      (row) => ({
        id: String(row.id ?? ""),
        title: text(row.title),
        description: text(row.description),
        priceNote: text(row.price_note),
        sortOrder: number(row.sort_order, 1000),
        active: bool(row.active, true),
      }),
    ),
    costing: costingRow
      ? {
          filamentCostPerGram: number(costingRow.filament_cost_per_gram),
          wastagePercent: Math.min(
            100,
            Math.max(0, number(costingRow.wastage_percent, 10)),
          ),
          electricityRatePerKwh: number(costingRow.electricity_rate_per_kwh),
          printerWatts: number(costingRow.printer_watts),
          machineCost: number(costingRow.machine_cost),
          machineLifeHours: number(costingRow.machine_life_hours),
          maintenancePerHour: number(costingRow.maintenance_per_hour),
          labourPerHour: number(costingRow.labour_per_hour),
          packagingPerJob: number(costingRow.packaging_per_job),
          paymentFeePercent: number(costingRow.payment_fee_percent),
          overheadPerMonth: number(costingRow.overhead_per_month),
          monthlyOrderTarget: number(costingRow.monthly_order_target),
          targetMarginPercent: Math.min(
            95,
            Math.max(0, number(costingRow.target_margin_percent, 60)),
          ),
          notes: text(costingRow.notes),
        }
      : { ...defaultPrintCosting },
    quotes: ((quotes.data ?? []) as Record<string, unknown>[]).map(
      mapPrintQuoteRow,
    ),
  };
}

// ── writes ───────────────────────────────────────────────────────────

async function requireSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session)
    throw new Error("Your session expired — sign in again, then retry.");
}

/** Save the calculator settings. Approval state is left exactly as stored. */
export async function savePrintSettings(
  settings: PrintSettings,
): Promise<void> {
  await requireSession();
  const { error } = await supabase
    .from("print_settings")
    .upsert(toPrintSettingsRow(settings));
  if (error) throw failure(error, "Could not save the 3D print settings.");
}

/** Publish or withdraw the rates (admins only in the UI). */
export async function setPrintApproval(
  approved: boolean,
  approvedBy: string,
): Promise<void> {
  await requireSession();
  const { error } = await supabase.from("print_settings").upsert({
    id: 1,
    pricing_status: approved ? "approved" : "draft",
    pricing_approved_at: approved ? new Date().toISOString() : null,
    pricing_approved_by: approved ? approvedBy : "",
    updated_at: new Date().toISOString(),
  });
  if (error)
    throw failure(error, "Could not change the print pricing approval.");
}

export async function savePrintCategory(item: PrintCategory): Promise<void> {
  await requireSession();
  const { error } = await supabase.from("print_categories").upsert({
    id: item.id,
    name: item.name.slice(0, 80),
    description: item.description.slice(0, 500),
    image_url: item.imageUrl.slice(0, 500),
    sort_order: Math.round(number(item.sortOrder, 1000)),
    active: item.active,
    updated_at: new Date().toISOString(),
  });
  if (error) throw failure(error, "Could not save the print category.");
}

export async function savePrintMaterial(item: PrintMaterial): Promise<void> {
  await requireSession();
  const { error } = await supabase.from("print_materials").upsert({
    id: item.id,
    name: item.name.slice(0, 60),
    description: item.description.slice(0, 500),
    rate_per_gram: Math.max(0, Math.round(number(item.ratePerGram))),
    note: item.note.slice(0, 200),
    sort_order: Math.round(number(item.sortOrder, 1000)),
    active: item.active,
    updated_at: new Date().toISOString(),
  });
  if (error) throw failure(error, "Could not save the print material.");
}

export async function savePrintPromotion(item: PrintPromotion): Promise<void> {
  await requireSession();
  const payload: Record<string, unknown> = {
    title: item.title.slice(0, 120),
    body: item.body.slice(0, 1000),
    image_url: item.imageUrl.slice(0, 500),
    cta_label: item.ctaLabel.slice(0, 40),
    cta_href: item.ctaHref.slice(0, 500),
    discount_type: item.discountType,
    discount_value: Math.max(0, Math.round(number(item.discountValue))),
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    active: item.active,
    sort_order: Math.round(number(item.sortOrder, 1000)),
    updated_at: new Date().toISOString(),
  };
  // A new promotion has no id yet — let the table default generate the uuid.
  if (item.id) payload.id = item.id;
  const { error } = await supabase.from("print_promotions").upsert(payload);
  if (error) throw failure(error, "Could not save the promotion.");
}

export async function savePrintGalleryItem(
  item: PrintGalleryItem,
): Promise<void> {
  await requireSession();
  const payload: Record<string, unknown> = {
    image_url: item.imageUrl.slice(0, 500),
    caption: item.caption.slice(0, 200),
    category: item.category.slice(0, 60),
    featured: item.featured,
    active: item.active,
    sort_order: Math.round(number(item.sortOrder, 1000)),
    updated_at: new Date().toISOString(),
  };
  if (item.id) payload.id = item.id;
  const { error } = await supabase.from("print_gallery").upsert(payload);
  if (error) throw failure(error, "Could not save the gallery item.");
}

export async function savePrintService(item: PrintServiceItem): Promise<void> {
  await requireSession();
  const payload: Record<string, unknown> = {
    title: item.title.slice(0, 80),
    description: item.description.slice(0, 500),
    price_note: item.priceNote.slice(0, 80),
    sort_order: Math.round(number(item.sortOrder, 1000)),
    active: item.active,
    updated_at: new Date().toISOString(),
  };
  if (item.id) payload.id = item.id;
  const { error } = await supabase.from("print_services").upsert(payload);
  if (error) throw failure(error, "Could not save the print service.");
}

const DELETE_TABLES = {
  category: "print_categories",
  material: "print_materials",
  promotion: "print_promotions",
  gallery: "print_gallery",
  service: "print_services",
} as const;

/** Hard delete (admins only in the UI; the RLS policy is admin-only too). */
export async function deletePrintRecord(
  kind: keyof typeof DELETE_TABLES,
  id: string,
): Promise<void> {
  await requireSession();
  const { error } = await supabase
    .from(DELETE_TABLES[kind])
    .delete()
    .eq("id", id);
  if (error) throw failure(error, "Could not delete that row.");
}

/** Internal costing sheet — staff-only table. */
export async function savePrintCosting(costing: PrintCosting): Promise<void> {
  await requireSession();
  const { error } = await supabase.from("print_costing").upsert({
    id: 1,
    filament_cost_per_gram: Math.max(0, number(costing.filamentCostPerGram)),
    wastage_percent: Math.min(
      100,
      Math.max(0, Math.round(number(costing.wastagePercent))),
    ),
    electricity_rate_per_kwh: Math.max(
      0,
      number(costing.electricityRatePerKwh),
    ),
    printer_watts: Math.max(0, Math.round(number(costing.printerWatts))),
    machine_cost: Math.max(0, Math.round(number(costing.machineCost))),
    machine_life_hours: Math.max(
      0,
      Math.round(number(costing.machineLifeHours)),
    ),
    maintenance_per_hour: Math.max(0, number(costing.maintenancePerHour)),
    labour_per_hour: Math.max(0, number(costing.labourPerHour)),
    packaging_per_job: Math.max(0, Math.round(number(costing.packagingPerJob))),
    payment_fee_percent: Math.min(
      100,
      Math.max(0, number(costing.paymentFeePercent)),
    ),
    overhead_per_month: Math.max(
      0,
      Math.round(number(costing.overheadPerMonth)),
    ),
    monthly_order_target: Math.max(
      0,
      Math.round(number(costing.monthlyOrderTarget)),
    ),
    target_margin_percent: Math.min(
      95,
      Math.max(0, Math.round(number(costing.targetMarginPercent))),
    ),
    notes: costing.notes.slice(0, 1000),
    updated_at: new Date().toISOString(),
  });
  if (error) throw failure(error, "Could not save the costing sheet.");
}

/** Move a request along, price it, or record slicer facts. */
export async function updatePrintQuote(
  id: string,
  patch: Partial<
    Pick<
      PrintQuote,
      | "status"
      | "adminNotes"
      | "quotedAmount"
      | "estimatedGrams"
      | "printHours"
      | "reprint"
    >
  >,
): Promise<void> {
  await requireSession();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status !== undefined) {
    if (!PRINT_QUOTE_STATUSES.includes(patch.status)) {
      throw new Error("Unknown request status.");
    }
    payload.status = patch.status;
  }
  if (patch.adminNotes !== undefined)
    payload.admin_notes = patch.adminNotes.slice(0, 2000);
  if (patch.quotedAmount !== undefined) {
    payload.quoted_amount = Math.max(0, Math.round(number(patch.quotedAmount)));
  }
  if (patch.estimatedGrams !== undefined) {
    payload.estimated_grams = Math.max(
      0,
      Math.round(number(patch.estimatedGrams)),
    );
  }
  if (patch.printHours !== undefined)
    payload.print_hours = Math.max(0, number(patch.printHours));
  if (patch.reprint !== undefined) payload.reprint = Boolean(patch.reprint);

  const { error } = await supabase
    .from("print_quote_requests")
    .update(payload)
    .eq("id", id);
  if (error) throw failure(error, "Could not update the request.");
}

// ── reports (same maths as the website's PrintReports) ───────────────

const formatNPR = (amount: number) =>
  `NPR ${Math.round(amount).toLocaleString("en-IN")}`;

/**
 * Everything is labelled an estimate: quoted revenue is what was quoted to
 * won requests, not money collected, and the margin needs a complete costing
 * sheet before it prints a number at all.
 */
export function derivePrintReports(
  quotes: PrintQuote[],
  costing: PrintCosting,
): PrintReportStat[] {
  const won = quotes.filter((quote) =>
    PRINT_QUOTE_WON_STATUSES.includes(quote.status),
  );
  const closed = quotes.filter(
    (quote) => quote.status !== "cancelled" && quote.status !== "rejected",
  );
  const revenue = won.reduce((sum, quote) => sum + quote.quotedAmount, 0);
  const grams = won.reduce(
    (sum, quote) => sum + quote.estimatedGrams * Math.max(1, quote.quantity),
    0,
  );
  const month = new Date().toISOString().slice(0, 7);
  const monthQuotes = quotes.filter((quote) =>
    quote.createdAt.startsWith(month),
  );
  const monthWon = monthQuotes.filter((quote) =>
    PRINT_QUOTE_WON_STATUSES.includes(quote.status),
  );
  const monthRevenue = monthWon.reduce(
    (sum, quote) => sum + quote.quotedAmount,
    0,
  );
  const reprints = quotes.filter((quote) => quote.reprint).length;
  const margins = won
    .map((quote) =>
      quoteMargin(costing, {
        quotedAmount: quote.quotedAmount,
        estimatedGrams: quote.estimatedGrams,
        printHours: quote.printHours,
        reprint: quote.reprint,
      }),
    )
    .filter(
      (value): value is NonNullable<ReturnType<typeof quoteMargin>> =>
        value !== null,
    );
  const averageMargin =
    margins.length > 0
      ? Math.round(
          (margins.reduce((sum, value) => sum + value.marginPercent, 0) /
            margins.length) *
            10,
        ) / 10
      : null;
  const costed = won.filter((quote) => quote.quotedAmount > 0).length;
  const sheet = costingStatus(costing);

  return [
    {
      label: "Quoted revenue",
      value: formatNPR(revenue),
      note: `${won.length} won quotes (approved → completed)`,
    },
    {
      label: "Average order",
      value: won.length > 0 ? formatNPR(Math.round(revenue / won.length)) : "—",
      note: `${costed} of ${won.length} quotes costed`,
    },
    {
      label: "Enquiry conversion",
      value:
        closed.length > 0
          ? `${Math.round((won.length / closed.length) * 100)}%`
          : "—",
      note: `${won.length} won / ${closed.length} live enquiries`,
    },
    {
      label: "This month",
      value: formatNPR(monthRevenue),
      note: `${monthWon.length} of ${monthQuotes.length} requests won`,
    },
    {
      label: "Material used",
      value: `${grams.toLocaleString("en-IN")} g`,
      note: "Slicer grams × quantity on won quotes",
    },
    {
      label: "Reprint rate",
      value:
        quotes.length > 0
          ? `${Math.round((reprints / quotes.length) * 100)}%`
          : "—",
      note: `${reprints} flagged reprint${reprints === 1 ? "" : "s"}`,
    },
    {
      label: "Average gross margin",
      value: averageMargin === null ? "—" : `${averageMargin}%`,
      note:
        averageMargin === null
          ? "Fill the Costs sheet to see margins"
          : "Estimate, not net profit",
    },
    {
      label: "Cost per quoted gram",
      value:
        sheet.complete && billedGramCost(costing) > 0
          ? `${formatNPR(Math.round(billedGramCost(costing) * 100) / 100)}/g`
          : "—",
      note: sheet.complete
        ? "Includes waste allowance"
        : `Missing: ${sheet.missing.join(", ")}`,
    },
  ];
}
