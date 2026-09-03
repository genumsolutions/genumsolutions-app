// =====================================================================
// analyticsService - app-side page-view tracking into the shared
// `page_views` table (same table the website writes to). Best-effort and
// debounced so screen-focus churn never spams the table; failures are
// swallowed so tracking can never break navigation.
// =====================================================================
import { supabase } from '../config/supabase'

// Skip re-recording the same screen within this window. Covers tab
// refocus and re-renders without losing genuine navigation.
const DEBOUNCE_MS = 5000

let lastPath = ''
let lastSentAt = 0

export async function recordScreenView(path: string): Promise<void> {
  const now = Date.now()
  if (path === lastPath && now - lastSentAt < DEBOUNCE_MS) return
  lastPath = path
  lastSentAt = now

  try {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('page_views').insert({
      path,
      user_id: session?.user?.id ?? null,
      referrer: null,
    })
  } catch {
    // Best-effort tracking; never surface errors to the UI.
  }
}