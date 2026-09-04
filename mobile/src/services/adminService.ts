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
import { supabase } from '../config/supabase'

const EDGE_BASE = 'https://bkylfnlybtsujwzropru.supabase.co/functions/v1'

export type AdminOrder = {
  id: string
  items: { name: string; quantity: number; price: number }[]
  totalNpr: number
  status: string
  provider: string
  customerName: string
  email: string
  address: string
  createdAt: string
}

export type AdminProduct = {
  id: string
  name: string
  category: string
  price: number
  priceLabel: string
  sku: string
  productType: string
  inventoryType: string | null
  note: string
  description: string
  specs: string[]
  stock: number
  delivery: string
  image: string
  badge: string | null
  active: boolean
  sortOrder: number
  // Project-package fields (only meaningful for project_type rows)
  projectOverview: string
  objectives: string[]
  materialsRequired: string[]
  learningOutcomes: string[]
  buildSteps: string[]
  controlMethods: string[]
  prerequisites: string[]
  deliverables: string[]
  estimatedDuration: string
  sourceFolder: string
  documentationUrl: string
  videoUrl: string
  maintenanceNotes: string
  audience: string
  difficulty: string
  warranty: string
}

export type AdminService = {
  id: string
  name: string
  category: string
  priceLabel: string
  description: string
  tag: string
  sortOrder: number
  active: boolean
}

export type AdminUser = {
  id: string
  email: string
  name: string
  phone: string
  address: string
  role: string
  createdAt: string | null
}

export type AdminMessage = {
  id: string
  name: string
  email: string
  message: string
  status: string
  createdAt: string
}

export type DashboardStats = {
  totalUsers: number
  totalCartItems: number
  activeCarts: number
  totalOrders: number
  pendingOrders: number
  paidOrders: number
  fulfilledOrders: number
  cancelledOrders: number
  revenue: number
  revenueToday: number
  totalProducts: number
  lowStockProducts: number
  totalMessages: number
  unreadMessages: number
  totalTransactions: number
  succeededTransactions: number
}

export type ActivityEntry = {
  id: string
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  details: Record<string, unknown>
  createdAt: string
}

// --- Row mappers (snake_case DB -> camelCase types) ------------------

type RawRow = Record<string, unknown>

/** Normalize a jsonb/text array column value to a string[]. */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).map(String)
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // ignore — fall through to the single-element fallback below
    }
    return [value]
  }
  return []
}

export function mapProductRow(row: RawRow): AdminProduct {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    price: Number(row.price ?? 0),
    priceLabel: String(row.price_label ?? ''),
    sku: String(row.sku ?? ''),
    productType: String(row.product_type ?? 'Retail kit'),
    inventoryType: row.inventory_type != null ? String(row.inventory_type) : null,
    note: String(row.note ?? ''),
    description: String(row.description ?? ''),
    specs: toStringArray(row.specs),
    stock: Number(row.stock ?? 0),
    delivery: String(row.delivery ?? ''),
    image: String(row.image_url ?? ''),
    badge: row.badge != null ? String(row.badge) : null,
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    projectOverview: String(row.project_overview ?? ''),
    objectives: toStringArray(row.objectives),
    materialsRequired: toStringArray(row.materials_required),
    learningOutcomes: toStringArray(row.learning_outcomes),
    buildSteps: toStringArray(row.build_steps),
    controlMethods: toStringArray(row.control_methods),
    prerequisites: toStringArray(row.prerequisites),
    deliverables: toStringArray(row.deliverables),
    estimatedDuration: String(row.estimated_duration ?? ''),
    sourceFolder: String(row.source_folder ?? ''),
    documentationUrl: String(row.documentation_url ?? ''),
    videoUrl: String(row.video_url ?? ''),
    maintenanceNotes: String(row.maintenance_notes ?? ''),
    audience: String(row.audience ?? ''),
    difficulty: String(row.difficulty ?? 'Beginner'),
    warranty: String(row.warranty ?? ''),
  }
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
    updated_at: new Date().toISOString(),
  }
}

export function mapServiceRow(row: RawRow): AdminService {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    priceLabel: String(row.price_label ?? ''),
    description: String(row.description ?? ''),
    tag: String(row.tag ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    active: row.active !== false,
  }
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
  }
}

export function mapOrderRow(row: RawRow): AdminOrder {
  return {
    id: String(row.id ?? ''),
    items: Array.isArray(row.items) ? (row.items as AdminOrder['items']) : [],
    totalNpr: Number(row.total_npr ?? 0),
    status: String(row.status ?? 'pending'),
    provider: String(row.provider ?? ''),
    customerName: String(row.customer_name ?? ''),
    email: String(row.email ?? ''),
    address: String(row.address ?? ''),
    createdAt: String(row.created_at ?? ''),
  }
}

export function mapMessageRow(row: RawRow): AdminMessage {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    message: String(row.message ?? ''),
    status: String(row.status ?? 'new'),
    createdAt: String(row.created_at ?? ''),
  }
}

export function mapActivityRow(row: RawRow): ActivityEntry {
  return {
    id: String(row.id ?? ''),
    userId: row.user_id != null ? String(row.user_id) : null,
    action: String(row.action ?? ''),
    entityType: String(row.entity_type ?? ''),
    entityId: row.entity_id != null ? String(row.entity_id) : null,
    details: (row.details as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ''),
  }
}

export function mapUserRow(row: RawRow): AdminUser {
  return {
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    role: String(row.role ?? 'customer'),
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }
}

// --- Orders ---

export async function listAdminOrders(page = 1, limit = 20, status?: string, query?: string): Promise<{ orders: AdminOrder[]; total: number; page: number; totalPages: number }> {
  let q = supabase.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (status) q = q.eq('status', status)
  if (query) q = q.or(`email.ilike.%${query}%,customer_name.ilike.%${query}%`)
  const { data, error, count } = await q
  if (error) throw error
  return { orders: (data ?? []).map(mapOrderRow), total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) }
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { data, error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId).select()
  if (error) throw error
  return data[0]
}

// --- Products ---

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const { data, error } = await supabase.from('products').select('*').order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapProductRow)
}

export async function upsertAdminProduct(product: AdminProduct) {
  const res = await fetch(`${EDGE_BASE}/admin-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', product: toProductRow(product) }),
  })
  if (!res.ok) {
    // Fallback to direct Supabase
    const { data, error } = await supabase.from('products').upsert(toProductRow(product)).select()
    if (error) throw error
    return data[0]
  }
  return res.json()
}

export async function deleteAdminProduct(id: string) {
  const res = await fetch(`${EDGE_BASE}/admin-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  })
  if (!res.ok) {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
    return true
  }
  return res.json()
}

// --- Services ---

export async function listAdminServices(): Promise<AdminService[]> {
  const { data, error } = await supabase.from('services').select('*').order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapServiceRow)
}

export async function upsertAdminService(service: AdminService) {
  const res = await fetch(`${EDGE_BASE}/admin-services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', service: toServiceRow(service) }),
  })
  if (!res.ok) {
    const { data, error } = await supabase.from('services').upsert(toServiceRow(service)).select()
    if (error) throw error
    return data[0]
  }
  return res.json()
}

export async function deleteAdminService(id: string) {
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw error
}

// --- Users ---

export async function listAdminUsers(page = 1, limit = 20, query?: string): Promise<{ users: AdminUser[]; total: number; page: number; totalPages: number }> {
  let q = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (query) q = q.or(`email.ilike.%${query}%,name.ilike.%${query}%`)
  const { data, error, count } = await q
  if (error) throw error
  return { users: (data ?? []).map(mapUserRow), total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) }
}

export async function toggleAdminRole(userId: string, role: 'admin' | 'customer') {
  const { data, error } = await supabase.from('profiles').update({ role }).eq('id', userId).select()
  if (error) throw error
  return data[0]
}

// --- Messages ---

export async function listAdminMessages(page = 1, limit = 20, status?: string): Promise<{ messages: AdminMessage[]; total: number; page: number; totalPages: number }> {
  let q = supabase.from('customer_messages').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (status) q = q.eq('status', status)
  const { data, error, count } = await q
  if (error) throw error
  return { messages: (data ?? []).map(mapMessageRow), total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) }
}

export async function markMessageReplied(id: string) {
  const { data, error } = await supabase.from('customer_messages').update({ status: 'replied' }).eq('id', id).select()
  if (error) throw error
  return data[0]
}

// --- Dashboard stats ---

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [{ data: orders }, { data: users }, { data: products }, { data: cartStats }] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact' }),
    // Profiles: owner can read their own; admin sees all via RLS
    supabase.from('profiles').select('*', { count: 'exact' }),
    supabase.from('products').select('*', { count: 'exact' }),
    supabase.rpc('get_admin_cart_stats'),
  ])
  const [{ data: messages }] = await Promise.all([
    supabase.from('customer_messages').select('*', { count: 'exact' }),
  ])
  const totalOrders = orders?.length ?? 0
  const allOrders = (orders ?? []) as any[]
  const pendingOrders = allOrders.filter((o: any) => o.status === 'pending').length
  const paidOrders = allOrders.filter((o: any) => o.status === 'paid').length
  const fulfilledOrders = allOrders.filter((o: any) => o.status === 'fulfilled').length
  const cancelledOrders = allOrders.filter((o: any) => o.status === 'cancelled').length
  const totalUsers = users?.length ?? 0
  const totalProducts = products?.length ?? 0
  const lowStockProducts = (products ?? []).filter((p: any) => p.stock !== null && p.stock < 5).length
  const totalMessages = messages?.length ?? 0
  const unreadMessages = (messages ?? []).filter((m: any) => m.status === 'new').length
  const cartSummary = Array.isArray(cartStats) ? cartStats[0] : cartStats
  // Calculate revenue from orders (paid + fulfilled)
  const revenue = allOrders
    .filter((o: any) => o.status === 'paid' || o.status === 'fulfilled')
    .reduce((sum: number, o: any) => sum + (Number(o.total_npr) || 0), 0)
  const today = new Date().toISOString().slice(0, 10)
  const revenueToday = allOrders
    .filter((o: any) => (o.status === 'paid' || o.status === 'fulfilled') && o.created_at?.startsWith(today))
    .reduce((sum: number, o: any) => sum + (Number(o.total_npr) || 0), 0)
  const succeededTransactions = allOrders.filter((o: any) => o.status === 'paid' || o.status === 'fulfilled').length

  return {
    totalUsers, totalOrders, pendingOrders, paidOrders, fulfilledOrders, cancelledOrders,
    revenue, revenueToday,
    totalProducts, lowStockProducts, totalMessages, unreadMessages,
    totalCartItems: Number(cartSummary?.total_cart_items ?? 0),
    activeCarts: Number(cartSummary?.active_carts ?? 0),
    totalTransactions: totalOrders,
    succeededTransactions,
  }
}

// --- Activity log ---

export async function listAdminActivity(page = 1, limit = 20): Promise<{ entries: ActivityEntry[]; total: number; page: number; totalPages: number }> {
  const { data, error, count } = await supabase
    .from('admin_activity')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)
  if (error) throw error
  return {
    entries: (data ?? []).map(mapActivityRow),
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  }
}

// --- Dashboard analytics (page_views) ---
// Mirrors the website's getPageViewStats: total/today views, top paths, and
// a per-day traffic series. RLS: admins may read page_views.

export type AdminAnalytics = {
  totalViews: number
  todayViews: number
  topPaths: { path: string; count: number; uniqueUsers: number }[]
  viewsByDay: { date: string; count: number }[]
}

export async function fetchAdminAnalytics(days = 30): Promise<AdminAnalytics> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const [allResult, todayResult] = await Promise.all([
    supabase.from('page_views').select('path, created_at, user_id').gte('created_at', since),
    supabase.from('page_views').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
  ])

  const todayViews = todayResult.count ?? 0
  const rows = (allResult.data ?? []) as { path: string; created_at: string; user_id: string | null }[]
  const totalViews = rows.length

  // Top paths
  const pathMap = new Map<string, { count: number; users: Set<string> }>()
  for (const { path, user_id } of rows) {
    const entry = pathMap.get(path) ?? { count: 0, users: new Set<string>() }
    entry.count += 1
    if (user_id) entry.users.add(user_id)
    pathMap.set(path, entry)
  }
  const topPaths = Array.from(pathMap.entries())
    .map(([path, { count, users }]) => ({ path, count, uniqueUsers: users.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // Views per day
  const dayMap = new Map<string, number>()
  for (const { created_at } of rows) {
    const day = created_at.slice(0, 10)
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1)
  }
  const viewsByDay = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { totalViews, todayViews, topPaths, viewsByDay }
}

// --- Journal posts (shared journal_posts table) ---

export type AdminJournalPost = {
  id: string
  tag: string
  title: string
  text: string
  active: boolean
  sortOrder: number
}

export async function listAdminJournalPosts(): Promise<AdminJournalPost[]> {
  const { data, error } = await supabase
    .from('journal_posts')
    .select('id, tag, title, text, active, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ''),
    tag: row.tag ? String(row.tag) : '',
    title: String(row.title ?? ''),
    text: row.text ? String(row.text) : '',
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }))
}

export async function upsertAdminJournalPost(post: AdminJournalPost) {
  const { data, error } = await supabase
    .from('journal_posts')
    .upsert({
      id: post.id,
      tag: post.tag,
      title: post.title,
      text: post.text,
      active: post.active !== false,
      sort_order: Math.max(0, Math.round(Number(post.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select()
  if (error) throw error
  return data[0]
}

export async function deleteAdminJournalPost(id: string) {
  const { error } = await supabase.from('journal_posts').delete().eq('id', id)
  if (error) throw error
}

// --- Company info (single-row company_info table) ---

export type AdminCompanyInfo = {
  name: string
  shortName: string
  address: string
  city: string
  country: string
  email: string
  phone: string
  pan: string
  vatLabel: string
  description: string
}

export async function getCompanyInfo(): Promise<AdminCompanyInfo | null> {
  const { data, error } = await supabase.from('company_info').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    name: String(data.name ?? ''),
    shortName: String(data.short_name ?? ''),
    address: String(data.address ?? ''),
    city: String(data.city ?? ''),
    country: String(data.country ?? ''),
    email: String(data.email ?? ''),
    phone: String(data.phone ?? ''),
    pan: String(data.pan ?? ''),
    vatLabel: String(data.vat_label ?? ''),
    description: String(data.description ?? ''),
  }
}

export async function saveCompanyInfo(info: AdminCompanyInfo) {
  const { data, error } = await supabase
    .from('company_info')
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
      updated_at: new Date().toISOString(),
    })
    .select()
  if (error) throw error
  return data[0]
}

// --- Training programs ---

export type AdminTrainingProgram = {
  id: string
  title: string
  audience: string
  description: string
  duration: string
  outcome: string
  active: boolean
  sortOrder: number
}

export async function listAdminTrainingPrograms(): Promise<AdminTrainingProgram[]> {
  const { data, error } = await supabase
    .from('training_programs')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    audience: String(row.audience ?? ''),
    description: String(row.description ?? ''),
    duration: String(row.duration ?? ''),
    outcome: String(row.outcome ?? ''),
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }))
}

export async function upsertAdminTrainingProgram(program: AdminTrainingProgram) {
  const { data, error } = await supabase
    .from('training_programs')
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
    .select()
  if (error) throw error
  return data[0]
}

export async function deleteAdminTrainingProgram(id: string) {
  const { error } = await supabase.from('training_programs').delete().eq('id', id)
  if (error) throw error
}

// --- Pilot cost lines ---

export type AdminPilotCostLine = {
  id: string
  item: string
  cost: string
  note: string
  active: boolean
  sortOrder: number
}

export async function listAdminPilotCostLines(): Promise<AdminPilotCostLine[]> {
  const { data, error } = await supabase
    .from('pilot_cost_lines')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ''),
    item: String(row.item ?? ''),
    cost: String(row.cost ?? ''),
    note: String(row.note ?? ''),
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }))
}

export async function upsertAdminPilotCostLine(line: AdminPilotCostLine) {
  const { data, error } = await supabase
    .from('pilot_cost_lines')
    .upsert({
      id: line.id,
      item: line.item,
      cost: line.cost,
      note: line.note,
      active: line.active !== false,
      sort_order: Math.max(0, Math.round(Number(line.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select()
  if (error) throw error
  return data[0]
}

export async function deleteAdminPilotCostLine(id: string) {
  const { error } = await supabase.from('pilot_cost_lines').delete().eq('id', id)
  if (error) throw error
}

// --- Curriculum highlights ---

export type AdminCurriculumHighlight = {
  id: string
  ageBand: string
  items: string[]
  active: boolean
  sortOrder: number
}

export async function listAdminCurriculumHighlights(): Promise<AdminCurriculumHighlight[]> {
  const { data, error } = await supabase
    .from('curriculum_highlights')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id ?? ''),
    ageBand: String(row.age_band ?? ''),
    items: toStringArray(row.items),
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  }))
}

export async function upsertAdminCurriculumHighlight(highlight: AdminCurriculumHighlight) {
  const { data, error } = await supabase
    .from('curriculum_highlights')
    .upsert({
      id: highlight.id,
      age_band: highlight.ageBand,
      items: highlight.items,
      active: highlight.active !== false,
      sort_order: Math.max(0, Math.round(Number(highlight.sortOrder) || 0)),
      updated_at: new Date().toISOString(),
    })
    .select()
  if (error) throw error
  return data[0]
}

export async function deleteAdminCurriculumHighlight(id: string) {
  const { error } = await supabase.from('curriculum_highlights').delete().eq('id', id)
  if (error) throw error
}
