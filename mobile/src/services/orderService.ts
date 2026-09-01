// =====================================================================
// orderService - writes to the shared `orders` and `transactions` Supabase
// tables (the same tables the website checkout uses). RLS allows a signed-in
// user to INSERT an order for themselves. Transaction ledger rows are
// service-role only, so we record provider/ref on the order row instead;
// the website's server can reconcile payments.
// =====================================================================
import { supabase } from '../config/supabase';
import type { CheckoutInput, Order } from '../types';

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
    .single();

  if (error) throw error;
  return data as Order;
}

/** List the signed-in user's orders (newest first). */
export async function getMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Order[]) ?? [];
}
