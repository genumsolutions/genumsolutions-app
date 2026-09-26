// =====================================================================
// adminService - native admin operations via Supabase Edge Functions
// and direct Supabase reads/writes (RLS: admin-only).
//
// NOTE (v1.5.8 Phase D/E): Supabase returns snake_case columns. Every
// read here maps rows to the camelCase types below, and every write maps
// back to snake_case so edited rows round-trip without losing fields
// (previously products were used unmapped: `product.productType` was
// always undefined, which emptied the ProjectPackages tab).
// =====================================================================
import { supabase } from "../config/supabase";

export type AdminOrder = {
  id: string;
  items: { name: string; quantity: number; price: number }[];
  totalNpr: number;
  status: string;
  provider: string;
  customerName: string;
  email: string;
  address: string;
  createdAt: string;
};

export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  /** U-44: the Projects-page grouping column (products.project_category). */
  projectCategory: string | null;
  price: number;
  priceLabel: string;
  sku: string;
  productType: string;
  inventoryType: string | null;
  note: string;
  description: string;
  specs: string[];
  stock: number;
  delivery: string;
  image: string;
  badge: string | null;
  active: boolean;
  sortOrder: number;
  // Project-package fields (only meaningful for project_type rows)
  projectOverview: string;
  objectives: string[];
  materialsRequired: string[];
  learningOutcomes: string[];
  buildSteps: string[];
  controlMethods: string[];
  prerequisites: string[];
  deliverables: string[];
  estimatedDuration: string;
  sourceFolder: string;
  documentationUrl: string;
  videoUrl: string;
  maintenanceNotes: string;
  audience: string;
  difficulty: string;
  warranty: string;
  gallery: string[];
  importMeta: Record<string, unknown>;
};

export type AdminService = {
  id: string;
  name: string;
  category: string;
  priceLabel: string;
  description: string;
  tag: string;
  sortOrder: number;
  active: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  role: string;
  tier: "free" | "pro";
  lastSeenAt: string | null;
  createdAt: string | null;
};

export type AdminMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: string;
  createdAt: string;
};

export type DashboardStats = {
  totalUsers: number;
  totalCartItems: number;
  activeCarts: number;
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  fulfilledOrders: number;
  cancelledOrders: number;
  revenue: number;
  revenueToday: number;
  totalProducts: number;
  lowStockProducts: number;
  totalMessages: number;
  unreadMessages: number;
  totalTransactions: number;
  succeededTransactions: number;
};

export type ActivityEntry = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

// --- Row mappers (snake_case DB -> camelCase types) ------------------

type RawRow = Record<string, unknown>;

/** Normalize a jsonb/text array column value to a string[]. */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // ignore — fall through to the single-element fallback below
    }
    return [value];
  }
  return [];
}

export function mapProductRow(row: RawRow): AdminProduct {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    price: Number(row.price ?? 0),
    priceLabel: String(row.price_label ?? ""),
    sku: String(row.sku ?? ""),
    productType: String(row.product_type ?? "Retail kit"),
    projectCategory:
      row.project_category != null ? String(row.project_category) : null,
    inventoryType:
      row.inventory_type != null ? String(row.inventory_type) : null,
    note: String(row.note ?? ""),
    description: String(row.description ?? ""),
    specs: toStringArray(row.specs),
    stock: Number(row.stock ?? 0),
    delivery: String(row.delivery ?? ""),
    image: String(row.image_url ?? ""),
    badge: row.badge != null ? String(row.badge) : null,
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    projectOverview: String(row.project_overview ?? ""),
    objectives: toStringArray(row.objectives),
    materialsRequired: toStringArray(row.materials_required),
    learningOutcomes: toStringArray(row.learning_outcomes),
    buildSteps: toStringArray(row.build_steps),
    controlMethods: toStringArray(row.control_methods),
    prerequisites: toStringArray(row.prerequisites),
    deliverables: toStringArray(row.deliverables),
    estimatedDuration: String(row.estimated_duration ?? ""),
    sourceFolder: String(row.source_folder ?? ""),
    documentationUrl: String(row.documentation_url ?? ""),
    videoUrl: String(row.video_url ?? ""),
    maintenanceNotes: String(row.maintenance_notes ?? ""),
    audience: String(row.audience ?? ""),
    difficulty: String(row.difficulty ?? "Beginner"),
    warranty: String(row.warranty ?? ""),
    gallery: toStringArray(row.gallery),
    importMeta:
      row.import_meta && typeof row.import_meta === "object"
        ? (row.import_meta as Record<string, unknown>)
        : {},
  };
}

/** camelCase product -> snake_case payload for the `products` table. */
export function toProductRow(product: AdminProduct): RawRow {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    price_label: product.priceLabel,
    sku: product.sku,
    product_type: product.productType,
    project_category: product.projectCategory ?? null,
    inventory_type: product.inventoryType,
    note: product.note,
    description: product.description,
    specs: product.specs,
    stock: product.stock,
    delivery: product.delivery,
    image_url: product.image,
    badge: product.badge,
    active: product.active !== false,
    sort_order: product.sortOrder,
    project_overview: product.projectOverview,
    objectives: product.objectives,
    materials_required: product.materialsRequired,
    learning_outcomes: product.learningOutcomes,
    build_steps: product.buildSteps,
    control_methods: product.controlMethods,
    prerequisites: product.prerequisites,
    deliverables: product.deliverables,
    estimated_duration: product.estimatedDuration,
    source_folder: product.sourceFolder,
    documentation_url: product.documentationUrl,
    video_url: product.videoUrl,
    maintenance_notes: product.maintenanceNotes,
    audience: product.audience,
    difficulty: product.difficulty,
    warranty: product.warranty,
    gallery: product.gallery,
    import_meta: product.importMeta,
    updated_at: new Date().toISOString(),
  };
}

export function mapServiceRow(row: RawRow): AdminService {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    priceLabel: String(row.price_label ?? ""),
    description: String(row.description ?? ""),
    tag: String(row.tag ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    active: row.active !== false,
  };
}

export function toServiceRow(service: AdminService): RawRow {
  return {
    id: service.id,
    name: service.name,
    category: service.category,
    price_label: service.priceLabel,
    description: service.description,
    tag: service.tag,
    sort_order: service.sortOrder,
    active: service.active !== false,
    updated_at: new Date().toISOString(),
  };
}

export function mapOrderRow(row: RawRow): AdminOrder {
  return {
    id: String(row.id ?? ""),
    items: Array.isArray(row.items) ? (row.items as AdminOrder["items"]) : [],
    totalNpr: Number(row.total_npr ?? 0),
    status: String(row.status ?? "pending"),
    provider: String(row.provider ?? ""),
    customerName: String(row.customer_name ?? ""),
    email: String(row.email ?? ""),
    address: String(row.address ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapMessageRow(row: RawRow): AdminMessage {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    message: String(row.message ?? ""),
    status: String(row.status ?? "new"),
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapActivityRow(row: RawRow): ActivityEntry {
  return {
    id: String(row.id ?? ""),
    userId: row.user_id != null ? String(row.user_id) : null,
    action: String(row.action ?? ""),
    entityType: String(row.entity_type ?? ""),
    entityId: row.entity_id != null ? String(row.entity_id) : null,
    details: (row.details as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapUserRow(row: RawRow): AdminUser {
  return {
    id: String(row.id ?? ""),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    address: String(row.address ?? ""),
    role: String(row.role ?? "customer"),
    tier: row.tier === "pro" ? "pro" : "free",
    lastSeenAt: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  };
}

// --- Orders ---

export async function listAdminOrders(
  page = 1,
  limit = 20,
  status?: string,
  query?: string,
): Promise<{
  orders: AdminOrder[];
  total: number;
  page: number;
  totalPages: number;
}> {
  let q = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (status) q = q.eq("status", status);
  if (query) q = q.or(`email.ilike.%${query}%,customer_name.ilike.%${query}%`);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    orders: (data ?? []).map(mapOrderRow),
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  };
}

// C1 (2026-09-23): transition-aware so stock follows the order lifecycle,
// mirroring the website's PATCH /api/admin/orders (lib/orders.ts):
//   pending -> paid/fulfilled   : atomic mark_order_paid (decrement, row-locked)
//   paid/fulfilled -> cancelled : guarded restore_order_stock (no double restore)
//   paid -> fulfilled           : no stock change (decremented at pay)
//   cancelled -> paid/fulfilled : re-decrement (order reinstated)
// The RPCs are SECURITY DEFINER and re-verify staff+ server-side; a stock
// hiccup is logged and never blocks the status flip.
export async function updateOrderStatus(orderId: string, status: string) {
  const next = String(status || "");
  const { data: existing } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  const pre = typeof existing?.status === "string" ? existing.status : null;
  if (pre && pre !== next) {
    try {
      if (pre === "pending" && (next === "paid" || next === "fulfilled")) {
        await supabase.rpc("mark_order_paid", { order_id: orderId });
      } else if (
        (pre === "paid" || pre === "fulfilled") &&
        next === "cancelled"
      ) {
        await supabase.rpc("restore_order_stock", {
          order_id: orderId,
          expect_status: pre,
        });
      } else if (
        pre === "cancelled" &&
        (next === "paid" || next === "fulfilled")
      ) {
        await supabase.rpc("mark_order_paid", { order_id: orderId });
      }
    } catch (stockError) {
      console.error("stock RPC failed during order status change", stockError);
    }
  }
  const { data, error } = await supabase
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .select();
  if (error) throw error;
  return data[0];
}

// --- Products --------------------------------------------------------
// Product writes MUST go through the `admin-products` edge function: the
// function re-verifies the caller's role server-side (staff+; delete = admin+)
// and writes with the service role, so inserts can't be silently rejected by
// RLS the way the old raw-fetch + direct anon-key fallback was (that path
// returned 404 because the function wasn't deployed and swallowed the error —
// the "saved product never showed" bug). functions.invoke attaches the user's
// JWT automatically and surfaces real errors to the UI.

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProductRow);
}

export async function upsertAdminProduct(product: AdminProduct) {
  const { data, error } = await supabase.functions.invoke("admin-products", {
    body: { action: "create", product: toProductRow(product) },
  });
  if (error) {
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not save the product.";
    throw new Error(message);
  }
  return data;
}

export async function deleteAdminProduct(id: string) {
  const { data, error } = await supabase.functions.invoke("admin-products", {
    body: { action: "delete", id },
  });
  if (error) {
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not delete the product.";
    throw new Error(message);
  }
  return data;
}

// --- Import by link (shared `link-import` edge function) -------------
// Both clients call the SAME edge function, so a pasted link imports the
// same way on the website admin and this app (same extraction, image
// upload to `product-images`, products upsert with documentation_url).

export type LinkPreview = {
  found: boolean;
  provider: string;
  sourceUrl: string;
  title: string;
  description: string;
  tags: string[];
  images: string[];
  categoryHint: string;
  specs?: string[];
  priceLabel?: string;
  extra?: Record<string, unknown>;
};

async function invokeLinkImport(body: {
  action: string;
  url: string;
  product?: Record<string, unknown>;
}) {
  // U-39 (2026-09-26): pre-flight session check. With persistSession:false the
  // in-memory access token can be stale after the app resumes in the
  // background past the token TTL; getSession() makes the client validate and
  // auto-refresh it before the JWT sails out to the edge fn (otherwise the
  // import 401s as "Sign in to import products" while the admin UI looks
  // perfectly signed-in).
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Your session expired — sign in again, then retry.");
  }
  const { data, error } = await supabase.functions.invoke("link-import", {
    body,
  });
  if (error) {
    // U-39: supabase-js v2 wraps non-2xx responses in FunctionsHttpError where
    // `error.context` is the raw Response (NOT a {message} object). Read the
    // body to surface the edge fn's real reason (e.g. "Only staff members can
    // import products.") instead of a generic fallback.
    let message = "";
    const ctx = (error as unknown as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === "function") {
      try {
        const bodyJson = (await (ctx as Response).json()) as Record<
          string,
          unknown
        >;
        message = String(bodyJson.error ?? bodyJson.message ?? "");
      } catch {
        /* body unreadable — fall through */
      }
    }
    if (!message) message = error instanceof Error ? error.message : "";
    throw new Error(message || "Could not import from that link.");
  }
  return data as Record<string, unknown>;
}

export async function previewLinkImport(url: string): Promise<LinkPreview> {
  const data = await invokeLinkImport({ action: "preview", url });
  return (
    (data.preview as LinkPreview) ?? {
      found: false,
      provider: "generic",
      sourceUrl: url,
      title: "",
      description: "",
      tags: [],
      images: [],
      categoryHint: "",
    }
  );
}

export async function createLinkImport(
  url: string,
  product: Partial<AdminProduct>,
): Promise<AdminProduct> {
  const data = await invokeLinkImport({
    action: "create",
    url,
    product: {
      name: product.name ?? "",
      category: product.category ?? "",
      // U-44: destination fields — the edge persists product_type and
      // project_category from these so a Projects-destined import creates a
      // real 'Project package' row (never a stranded Retail kit).
      productType: product.productType ?? "Retail kit",
      projectCategory: product.projectCategory ?? null,
      description: product.description ?? "",
      price: Number(product.price) || 0,
      priceLabel: product.priceLabel || "Request quote",
      stock: Number(product.stock) || 0,
      specs: Array.isArray(product.specs) ? product.specs : [],
      // U-23 (2026-09-24): send the previewed gallery so the saved import
      // keeps every extracted photo ("last link sticks").
      image: product.image || "",
      gallery: Array.isArray(product.gallery)
        ? product.gallery.slice(0, 8)
        : [],
    },
  });
  return mapProductRow((data.product as RawRow) ?? {});
}

// --- Services ---
// Service writes MUST go through the `admin-services` edge function, exactly
// like products: the function re-verifies the caller's role server-side
// (staff+ for write, admin+ for delete) and writes with the service role.
// The previous raw-fetch + direct anon-key fallback hit an UNGATED function
// (anyone could write services) and, before that, silently dropped failures
// under RLS. functions.invoke attaches the user's JWT automatically and
// surfaces real errors to the UI.

export async function listAdminServices(): Promise<AdminService[]> {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapServiceRow);
}

export async function upsertAdminService(service: AdminService) {
  const { data, error } = await supabase.functions.invoke("admin-services", {
    body: { action: "create", service: toServiceRow(service) },
  });
  if (error) {
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not save the service.";
    throw new Error(message);
  }
  return data;
}

export async function deleteAdminService(id: string) {
  const { data, error } = await supabase.functions.invoke("admin-services", {
    body: { action: "delete", id },
  });
  if (error) {
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not delete the service.";
    throw new Error(message);
  }
  return data;
}

// --- Users ---

export async function listAdminUsers(
  page = 1,
  limit = 20,
  query?: string,
): Promise<{
  users: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
}> {
  let q = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query) q = q.or(`email.ilike.%${query}%,name.ilike.%${query}%`);
  const { data, error, count } = await q;
  if (error) throw error;
  const users = (data ?? []).map(mapUserRow);
  // Website-parity "Last seen": auth.users is invisible to the anon key, so
  // read it per-user through the admin-gated SECURITY DEFINER function.
  await Promise.all(
    users.map(async (user) => {
      const { data: seen, error: fnError } = await supabase.rpc(
        "admin_user_last_seen",
        { target_user_id: user.id },
      );
      if (!fnError && typeof seen === "string") user.lastSeenAt = seen;
    }),
  );
  return {
    users,
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  };
}

// Role + tier changes MUST go through the admin-set-role edge function: the DB
// triggers protect_role_column / protect_tier_column only let the service role
// change profiles.role / profiles.tier, so a direct anon-key update is REJECTED
// (the old direct call silently did nothing — revoke never applied). The edge
// function verifies the caller is an admin, blocks self-demotion, and logs to
// activity_log. Send whichever field changed; the function accepts either.
export async function toggleAdminRole(
  userId: string,
  role: "customer" | "staff" | "admin",
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in to change roles.");
  const { data, error } = await supabase.functions.invoke("admin-set-role", {
    body: { userId, role },
  });
  if (error) {
    // functions.invoke surfaces non-2xx as FunctionsHttpError; the function's
    // JSON error message is the useful part for the admin UI.
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not update the role.";
    throw new Error(message);
  }
  return data;
}

// Tier flips ride the SAME edge function (one deploy, one audit vocabulary).
export async function setUserTier(userId: string, tier: "free" | "pro") {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in to change tiers.");
  const { data, error } = await supabase.functions.invoke("admin-set-role", {
    body: { userId, tier },
  });
  if (error) {
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not update the tier.";
    throw new Error(message);
  }
  return data;
}

// --- Delete user (owner-only) ----------------------------------------------
// auth.users is invisible to the anon key and deletes demand the service role,
// so this mirrors the website's DELETE /api/admin/users through an edge
// function. The function re-checks the caller is role 'owner' server-side.
export async function deleteAdminUser(userId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in to delete users.");
  const { data, error } = await supabase.functions.invoke("admin-delete-user", {
    body: { userId },
  });
  if (error) {
    const message =
      (error as unknown as { context?: { message?: string } })?.context
        ?.message ||
      (error instanceof Error ? error.message : "") ||
      "Could not delete the user.";
    throw new Error(message);
  }
  return data;
}

// --- Admin per-user robot settings (robot_user_settings) -------------------
// RLS: staff and above (is_staff()) may read/write every user's robot rows;
// deletes require admin or above (is_admin()). These run on the signed-in
// user's own session — same contract as the website admin panel.

export type AdminRobotSetting = {
  robotId: string;
  robotName: string;
  settings: Record<string, string | number | boolean | string[]>;
  updatedAt: string;
};

export async function listUserRobotSettings(
  userId: string,
): Promise<AdminRobotSetting[]> {
  const { data, error } = await supabase
    .from("robot_user_settings")
    .select("robot_id, robot_name, settings, updated_at")
    .eq("user_id", userId)
    .order("robot_name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    robotId: row.robot_id as string,
    robotName: (row.robot_name as string) || "",
    settings: (row.settings as AdminRobotSetting["settings"]) || {},
    updatedAt: row.updated_at as string,
  }));
}

export async function upsertUserRobotSettings(
  userId: string,
  robotId: string,
  robotName: string,
  settings: AdminRobotSetting["settings"],
) {
  const { error } = await supabase.from("robot_user_settings").upsert(
    {
      user_id: userId,
      robot_id: robotId,
      robot_name: robotName,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,robot_id" },
  );
  if (error) throw error;
}

export async function deleteUserRobotSetting(userId: string, robotId: string) {
  const { error } = await supabase
    .from("robot_user_settings")
    .delete()
    .eq("user_id", userId)
    .eq("robot_id", robotId);
  if (error) throw error;
}

// --- Messages ---

export async function listAdminMessages(
  page = 1,
  limit = 20,
  status?: string,
): Promise<{
  messages: AdminMessage[];
  total: number;
  page: number;
  totalPages: number;
}> {
  let q = supabase
    .from("customer_messages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    messages: (data ?? []).map(mapMessageRow),
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  };
}

export async function markMessageReplied(id: string) {
  const { data, error } = await supabase
    .from("customer_messages")
    .update({ status: "replied" })
    .eq("id", id)
    .select();
  if (error) throw error;
  return data[0];
}

// --- Dashboard stats ---

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [
    { data: orders },
    { data: users },
    { data: products },
    { data: cartStats },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact" }),
    // Profiles: owner can read their own; admin sees all via RLS
    supabase.from("profiles").select("*", { count: "exact" }),
    supabase.from("products").select("*", { count: "exact" }),
    supabase.rpc("get_admin_cart_stats"),
  ]);
  const [{ data: messages }] = await Promise.all([
    supabase.from("customer_messages").select("*", { count: "exact" }),
  ]);
  const totalOrders = orders?.length ?? 0;
  const allOrders = (orders ?? []) as any[];
  const pendingOrders = allOrders.filter(
    (o: any) => o.status === "pending",
  ).length;
  const paidOrders = allOrders.filter((o: any) => o.status === "paid").length;
  const fulfilledOrders = allOrders.filter(
    (o: any) => o.status === "fulfilled",
  ).length;
  const cancelledOrders = allOrders.filter(
    (o: any) => o.status === "cancelled",
  ).length;
  const totalUsers = users?.length ?? 0;
  const totalProducts = products?.length ?? 0;
  const lowStockProducts = (products ?? []).filter(
    (p: any) => p.stock !== null && p.stock < 5,
  ).length;
  const totalMessages = messages?.length ?? 0;
  const unreadMessages = (messages ?? []).filter(
    (m: any) => m.status === "new",
  ).length;
  const cartSummary = Array.isArray(cartStats) ? cartStats[0] : cartStats;
  // Calculate revenue from orders (paid + fulfilled)
  const revenue = allOrders
    .filter((o: any) => o.status === "paid" || o.status === "fulfilled")
    .reduce((sum: number, o: any) => sum + (Number(o.total_npr) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const revenueToday = allOrders
    .filter(
      (o: any) =>
        (o.status === "paid" || o.status === "fulfilled") &&
        o.created_at?.startsWith(today),
    )
    .reduce((sum: number, o: any) => sum + (Number(o.total_npr) || 0), 0);
  const succeededTransactions = allOrders.filter(
    (o: any) => o.status === "paid" || o.status === "fulfilled",
  ).length;

  return {
    totalUsers,
    totalOrders,
    pendingOrders,
    paidOrders,
    fulfilledOrders,
    cancelledOrders,
    revenue,
    revenueToday,
    totalProducts,
    lowStockProducts,
    totalMessages,
    unreadMessages,
    totalCartItems: Number(cartSummary?.total_cart_items ?? 0),
    activeCarts: Number(cartSummary?.active_carts ?? 0),
    totalTransactions: totalOrders,
    succeededTransactions,
  };
}

// --- Activity log ---

export async function listAdminActivity(
  page = 1,
  limit = 20,
): Promise<{
  entries: ActivityEntry[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const { data, error, count } = await supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return {
    entries: (data ?? []).map(mapActivityRow),
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  };
}

// --- Dashboard analytics (page_views) ---
// Mirrors the website's getPageViewStats: total/today views, top paths, and
// a per-day traffic series. RLS: admins may read page_views.

export type AdminAnalytics = {
  totalViews: number;
  todayViews: number;
  topPaths: { path: string; count: number; uniqueUsers: number }[];
  viewsByDay: { date: string; count: number }[];
};

export async function fetchAdminAnalytics(days = 30): Promise<AdminAnalytics> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [allResult, todayResult] = await Promise.all([
    supabase
      .from("page_views")
      .select("path, created_at, user_id")
      .gte("created_at", since),
    supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO),
  ]);

  const todayViews = todayResult.count ?? 0;
  const rows = (allResult.data ?? []) as {
    path: string;
    created_at: string;
    user_id: string | null;
  }[];
  const totalViews = rows.length;

  // Top paths
  const pathMap = new Map<string, { count: number; users: Set<string> }>();
  for (const { path, user_id } of rows) {
    const entry = pathMap.get(path) ?? { count: 0, users: new Set<string>() };
    entry.count += 1;
    if (user_id) entry.users.add(user_id);
    pathMap.set(path, entry);
  }
  const topPaths = Array.from(pathMap.entries())
    .map(([path, { count, users }]) => ({
      path,
      count,
      uniqueUsers: users.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Views per day
  const dayMap = new Map<string, number>();
  for (const { created_at } of rows) {
    const day = created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const viewsByDay = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { totalViews, todayViews, topPaths, viewsByDay };
}

// --- Journal posts (shared journal_posts table) ---

export type AdminJournalPost = {
  id: string;
  tag: string;
  title: string;
  text: string;
  active: boolean;
  sortOrder: number;
};

export async function listAdminJournalPosts(): Promise<AdminJournalPost[]> {
  const { data, error } = await supabase
    .from("journal_posts")
    .select("id, tag, title, text, active, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    tag: row.tag ? String(row.tag) : "",
    title: String(row.title ?? ""),
    text: row.text ? String(row.text) : "",
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function upsertAdminJournalPost(post: AdminJournalPost) {
  const { data, error } = await supabase
    .from("journal_posts")
    .upsert({
      id: post.id,
      tag: post.tag,
      title: post.title,
      text: post.text,
      active: post.active !== false,
      sort_order: Math.max(0, Math.round(Number(post.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteAdminJournalPost(id: string) {
  const { error } = await supabase.from("journal_posts").delete().eq("id", id);
  if (error) throw error;
}

// --- Company info (single-row company_info table) ---

export type AdminCompanyInfo = {
  name: string;
  shortName: string;
  address: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  pan: string;
  vatLabel: string;
  description: string;
  // C5 (2026-09-23): socials + WhatsApp (admin-editable). Empty = unused.
  whatsappNumber: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
};

export async function getCompanyInfo(): Promise<AdminCompanyInfo | null> {
  const { data, error } = await supabase
    .from("company_info")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: String(data.name ?? ""),
    shortName: String(data.short_name ?? ""),
    address: String(data.address ?? ""),
    city: String(data.city ?? ""),
    country: String(data.country ?? ""),
    email: String(data.email ?? ""),
    phone: String(data.phone ?? ""),
    pan: String(data.pan ?? ""),
    vatLabel: String(data.vat_label ?? ""),
    description: String(data.description ?? ""),
    whatsappNumber: String(data.whatsapp_number ?? ""),
    facebookUrl: String(data.facebook_url ?? ""),
    instagramUrl: String(data.instagram_url ?? ""),
    tiktokUrl: String(data.tiktok_url ?? ""),
    linkedinUrl: String(data.linkedin_url ?? ""),
    youtubeUrl: String(data.youtube_url ?? ""),
  };
}

export async function saveCompanyInfo(info: AdminCompanyInfo) {
  const { data, error } = await supabase
    .from("company_info")
    .upsert({
      id: 1,
      name: info.name,
      short_name: info.shortName,
      address: info.address,
      city: info.city,
      country: info.country,
      email: info.email,
      phone: info.phone,
      pan: info.pan,
      vat_label: info.vatLabel,
      description: info.description,
      // C5: WhatsApp normalized to digits-only on save (canonical form).
      whatsapp_number: info.whatsappNumber.replace(/[^\d]/g, ""),
      facebook_url: info.facebookUrl,
      instagram_url: info.instagramUrl,
      tiktok_url: info.tiktokUrl,
      linkedin_url: info.linkedinUrl,
      youtube_url: info.youtubeUrl,
      updated_at: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return data[0];
}

// --- Training programs ---

export type AdminTrainingProgram = {
  id: string;
  title: string;
  audience: string;
  description: string;
  duration: string;
  outcome: string;
  active: boolean;
  sortOrder: number;
};

export async function listAdminTrainingPrograms(): Promise<
  AdminTrainingProgram[]
> {
  const { data, error } = await supabase
    .from("training_programs")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    audience: String(row.audience ?? ""),
    description: String(row.description ?? ""),
    duration: String(row.duration ?? ""),
    outcome: String(row.outcome ?? ""),
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function upsertAdminTrainingProgram(
  program: AdminTrainingProgram,
) {
  const { data, error } = await supabase
    .from("training_programs")
    .upsert({
      id: program.id,
      title: program.title,
      audience: program.audience,
      description: program.description,
      duration: program.duration,
      outcome: program.outcome,
      active: program.active !== false,
      sort_order: Math.max(0, Math.round(Number(program.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteAdminTrainingProgram(id: string) {
  const { error } = await supabase
    .from("training_programs")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// --- Pilot cost lines ---

export type AdminPilotCostLine = {
  id: string;
  item: string;
  cost: string;
  note: string;
  active: boolean;
  sortOrder: number;
};

export async function listAdminPilotCostLines(): Promise<AdminPilotCostLine[]> {
  const { data, error } = await supabase
    .from("pilot_cost_lines")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    item: String(row.item ?? ""),
    cost: String(row.cost ?? ""),
    note: String(row.note ?? ""),
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function upsertAdminPilotCostLine(line: AdminPilotCostLine) {
  const { data, error } = await supabase
    .from("pilot_cost_lines")
    .upsert({
      id: line.id,
      item: line.item,
      cost: line.cost,
      note: line.note,
      active: line.active !== false,
      sort_order: Math.max(0, Math.round(Number(line.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteAdminPilotCostLine(id: string) {
  const { error } = await supabase
    .from("pilot_cost_lines")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// --- Curriculum highlights ---

export type AdminCurriculumHighlight = {
  id: string;
  ageBand: string;
  items: string[];
  active: boolean;
  sortOrder: number;
};

export async function listAdminCurriculumHighlights(): Promise<
  AdminCurriculumHighlight[]
> {
  const { data, error } = await supabase
    .from("curriculum_highlights")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    ageBand: String(row.age_band ?? ""),
    items: toStringArray(row.items),
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function upsertAdminCurriculumHighlight(
  highlight: AdminCurriculumHighlight,
) {
  const { data, error } = await supabase
    .from("curriculum_highlights")
    .upsert({
      id: highlight.id,
      age_band: highlight.ageBand,
      items: highlight.items,
      active: highlight.active !== false,
      sort_order: Math.max(0, Math.round(Number(highlight.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteAdminCurriculumHighlight(id: string) {
  const { error } = await supabase
    .from("curriculum_highlights")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
