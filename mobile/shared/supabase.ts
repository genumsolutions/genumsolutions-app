// =====================================================================
// Supabase client connector.
//
// SUPABASE_URL and SUPABASE_ANON_KEY come from your Supabase project:
//   Supabase -> Project Settings -> API
//   (bare project URL, no /rest/v1/ suffix)
//
// The anon key is public by design but database rows are protected by
// Row Level Security policies. Never add the service_role key here.
// =====================================================================
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bkylfnlybtsujwzropru.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJreWxmbmx5YnRzdWp3enJvcHJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDE5NjksImV4cCI6MjEwMzA3Nzk2OX0.M-FOzaR4P1p-AHweG60n5STGpJRgbwdgodAcenMr0IQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
