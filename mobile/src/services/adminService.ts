// =====================================================================
// adminService - native admin operations via Supabase Edge Functions
// and direct Supabase reads/writes (RLS: admin-only).
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
  note: string
  description: string
  specs: string[]
  stock: number
  delivery: string
  image: string
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

// --- Orders ---

export async function listAdminOrders(page = 1, limit = 20, status?: string, query?: string): Promise<{ orders: AdminOrder[]; total: number; page: number; totalPages: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status) params.set('status', status)
  if (query) params.set('q', query)
  const res = await fetch(`${EDGE_BASE}/admin-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list' }),
  })
  // Fallback: read orders directly from Supabase
  let q = supabase.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (status) q = q.eq('status', status)
  if (query) q = q.or(`email.ilike.%${query}%,customer_name.ilike.%${query}%`)
  const { data, error, count } = await q
  if (error) throw error
  return { orders: (data ?? []) as AdminOrder[], total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) }
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
  return (data ?? []) as AdminProduct[]
}

export async function upsertAdminProduct(product: AdminProduct) {
  const res = await fetch(`${EDGE_BASE}/admin-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', product }),
  })
  if (!res.ok) {
    // Fallback to direct Supabase
    const { data, error } = await supabase.from('products').upsert(product).select()
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
  return (data ?? []) as AdminService[]
}

export async function upsertAdminService(service: AdminService) {
  const res = await fetch(`${EDGE_BASE}/admin-services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', service }),
  })
  if (!res.ok) {
    const { data, error } = await supabase.from('services').upsert(service).select()
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

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AdminUser[]
}

export async function toggleAdminRole(userId: string, role: 'admin' | 'customer') {
  const { data, error } = await supabase.from('profiles').update({ role }).eq('id', userId).select()
  if (error) throw error
  return data[0]
}

// --- Messages ---

export async function listAdminMessages(page = 1, limit = 20): Promise<{ messages: AdminMessage[]; total: number; page: number; totalPages: number }> {
  const { data, error, count } = await supabase.from('customer_messages').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (error) throw error
  return { messages: (data ?? []) as AdminMessage[], total: count ?? 0, page, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) }
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
  const pendingOrders = (orders ?? []).filter((o: any) => o.status === 'pending').length
  const totalUsers = users?.length ?? 0
  const totalProducts = products?.length ?? 0
  const lowStockProducts = (products ?? []).filter((p: any) => p.stock !== null && p.stock < 5).length
  const totalMessages = messages?.length ?? 0
  const cartSummary = Array.isArray(cartStats) ? cartStats[0] : cartStats
  // Calculate revenue from orders
  const allOrders = (orders ?? []) as any[]
  const revenue = allOrders
    .filter((o: any) => o.status === 'paid' || o.status === 'fulfilled')
    .reduce((sum: number, o: any) => sum + (Number(o.total_npr) || 0), 0)
  const today = new Date().toISOString().slice(0, 10)
  const revenueToday = allOrders
    .filter((o: any) => (o.status === 'paid' || o.status === 'fulfilled') && o.created_at?.startsWith(today))
    .reduce((sum: number, o: any) => sum + (Number(o.total_npr) || 0), 0)
  const succeededTransactions = allOrders.filter((o: any) => o.status === 'paid' || o.status === 'fulfilled').length

  return {
    totalUsers, totalOrders, pendingOrders, revenue, revenueToday,
    totalProducts, lowStockProducts, totalMessages, unreadMessages: totalMessages,
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
    entries: (data ?? []) as ActivityEntry[],
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  }
}