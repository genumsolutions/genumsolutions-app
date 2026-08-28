// =====================================================================
// Supabase client connector (PLACEHOLDERS ONLY).
//
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase dashboard:
//   Supabase -> Project Settings -> API
//   (use the bare project URL, do NOT append /rest/v1/)
//
// Do NOT hardcode real keys in git. For local development put them in a
// mobile/.env file (create it if missing) or use expo prebuild / EAS envs.
// =====================================================================
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = '<YOUR_SUPABASE_URL>';
export const SUPABASE_ANON_KEY = '<YOUR_SUPABASE_ANON_KEY>';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
