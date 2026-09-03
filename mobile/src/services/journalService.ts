// =====================================================================
// journalService - reads the shared `journal_posts` Supabase table (the
// SAME table the website's journal-store reads) so the app and the website
// always show the same latest posts. Falls back to the bundled posts when
// Supabase is not configured or unreachable.
//
// RLS: journal_posts has a public-read policy, so the app's anon key can
// SELECT without a session.
// =====================================================================
import { supabase, supabaseConfigured } from '../config/supabase';
import { LOCAL_JOURNAL_POSTS, type JournalPost } from '../config/journal';

export async function getJournalPosts(): Promise<JournalPost[]> {
  if (!supabaseConfigured) return LOCAL_JOURNAL_POSTS;
  try {
    const { data, error } = await supabase
      .from('journal_posts')
      .select('id, tag, title, text')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return LOCAL_JOURNAL_POSTS;
    return data.map((row) => ({
      id: row.id,
      tag: row.tag,
      title: row.title,
      text: row.text,
    }));
  } catch {
    return LOCAL_JOURNAL_POSTS;
  }
}
