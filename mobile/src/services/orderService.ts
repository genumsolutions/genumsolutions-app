// =====================================================================
// orderService - writes to the shared `orders` and `transactions` Supabase
// tables (the same tables the website checkout uses). RLS allows a signed-in
// user to INSERT an order for themselves. Transaction ledger rows are
// service-role only, so we record provider/ref on the order row instead;
// the website's server can reconcile payments.
// =====================================================================
import { supabase } from '../config/supabase';
import type { CheckoutInput, Order } from '../types';

// Supabase Edge Function URLs (configured via environment)
const EDGE_BASE = 'https://bkylfnlybtsujwzropru.supabase.co/functions/v1'

const edgeUrls = {
  paymentEsewa: `${EDGE_BASE}/payment-esewa`,
  paymentKhalti: `${EDGE_BASE}/payment-khalti`,
  paymentWebhook: `${EDGE_BASE}/payment-webhook`,
  contact: `${EDGE_BASE}/contact`,
  adminProducts: `${EDGE_BASE}/admin-products`,
  adminServices: `${EDGE_BASE}/admin-services`,
  siteContent: `${EDGE_BASE}/site-content`,
}

/** Create an order for the current signed-in user. Returns the created row. */
export async function createOrder(input: CheckoutInput): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      items: input.items,
      total_npr: input.totalNpr,
      status: 'pending',
      provider: input.provider,
      customer_name: input.customerName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    })
    .select()
    .single()

  if (error) throw error
  return data as Order
}

/** List the signed-in user's orders (newest first). */
export async function getMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as Order[]) ?? []
}

/** Initiate eSewa payment for the given order.
 *  The app calls this then redirects the user to eSewa's payment page.
 */
export async function initiateEsewaPayment(orderId: string, amountNpr: number): Promise<{ actionUrl: string; fields: Record<string, string> }> {
  const res = await fetch(edgeUrls.paymentEsewa, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'initiate',
      amount: String(amountNpr),
      transactionUuid: orderId,
      productCode: 'EPAYTEST',
      successUrl: `${process.env.EXPO_PUBLIC_SITE_URL || ''}/checkout/success?provider=esewa`,
      failureUrl: `${process.env.EXPO_PUBLIC_SITE_URL || ''}/checkout`,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`eSewa initiate failed: ${err}`)
  }
  return res.json()
}

/** Initiate Khalti payment for the given order.
 *  The app calls this then redirects the user to Khalti's payment page.
 */
export async function initiateKhaltiPayment(orderId: string, amountNpr: number): Promise<{ url: string; pidx: string }> {
  const res = await fetch(edgeUrls.paymentKhalti, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'initiate',
      amount: amountNpr,
      purchaseOrderId: orderId,
      purchaseOrderName: `GENUM order ${orderId.slice(0, 8)}`,
      returnUrl: `${process.env.EXPO_PUBLIC_SITE_URL || ''}/checkout/success?provider=khalti`,
      websiteUrl: process.env.EXPO_PUBLIC_SITE_URL || '',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Khalti initiate failed: ${err}`)
  }
  return res.json()
}

/** Send a contact inquiry - persists to customer_messages + sends email via Resend. */
export async function sendContactInquiry(name: string, email: string, message: string): Promise<{ success: boolean; persisted: boolean }> {
  const res = await fetch(edgeUrls.contact, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, message }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Contact failed: ${err}`)
  }
  return res.json()
}

/** Fetch current site content (home hero title/body) from Supabase via Edge Function. */
export async function fetchSiteContent() {
  const res = await fetch(edgeUrls.siteContent, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get' }),
  })

  if (!res.ok) throw new Error('Failed to fetch site content')
  return res.json()
}

/** Upsert site content (home hero title/body) - admin only. */
export async function upsertSiteContent(content: { id: number; home_title: string; home_body: string }) {
  const res = await fetch(edgeUrls.siteContent, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', content }),
  })

  if (!res.ok) throw new Error('Failed to upsert site content')
  return res.json()
}

/** List products via Edge Function (admin). */
export async function listProductsAdmin() {
  const res = await fetch(edgeUrls.adminProducts, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list' }),
  })

  if (!res.ok) throw new Error('Failed to list products')
  return res.json()
}

/** Create/update product via Edge Function (admin). */
export async function upsertProductAdmin(product: any) {
  const res = await fetch(edgeUrls.adminProducts, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', product }),
  })

  if (!res.ok) throw new Error('Failed to create product')
  return res.json()
}

/** List services via Edge Function (admin). */
export async function listServicesAdmin() {
  const res = await fetch(edgeUrls.adminServices, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list' }),
  })

  if (!res.ok) throw new Error('Failed to list services')
  return res.json()
}

/** Create/update service via Edge Function (admin). */
export async function upsertServiceAdmin(service: any) {
  const res = await fetch(edgeUrls.adminServices, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', service }),
  })

  if (!res.ok) throw new Error('Failed to create service')
  return res.json()
}

/** Update the signed-in user's profile (name, phone, address). */
export async function updateProfile(userId: string, patch: { name?: string; phone?: string; address?: string }) {
  const update: Record<string, string> = {}
  if (typeof patch.name === 'string') update.name = patch.name.trim().slice(0, 120)
  if (typeof patch.phone === 'string') update.phone = patch.phone.trim().slice(0, 40)
  if (typeof patch.address === 'string') update.address = patch.address.trim().slice(0, 500)
  if (!Object.keys(update).length) return
  const { data, error } = await supabase.from('profiles').update(update).eq('id', userId).select()
  if (error) throw error
  return data
}