-- =====================================================================
-- GENUM SOLUTIONS MOBILE - offline-first schema migration
--
-- HOW TO RUN (manual step - I cannot run this for you):
--   1. Open Supabase dashboard -> your project -> SQL Editor.
--   2. Paste the contents of this file and press RUN.
--      (Safe to re-run; uses IF NOT EXISTS / idempotent guards.)
--
-- What this adds for the mobile app:
--   * offline_audits  - audits created on-device then synced.
--   * offline_products_edits - worker/product edits queued on-device
--                              that sync into the existing `products` table.
--
-- The `products` and `profiles` tables are ALREADY created by the
-- genumsolutions-website project (see website/supabase/schema.sql).
-- We reference them here for RLS alignment instead of re-creating them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ensure the admin helper exists (mirrors website schema).
-- The website repo already defines this; IF NOT EXISTS is a safety no-op.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- OFFLINE AUDITS (new table, used by mobile OfflineAuditScreen/SyncService)
-- ---------------------------------------------------------------------
create table if not exists public.offline_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft','submitted','approved')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offline_audits_user_idx
  on public.offline_audits(user_id);

-- RLS on by default; employees manage their own audits, admins see all.
alter table public.offline_audits enable row level security;

drop policy if exists "own audits select" on public.offline_audits;
create policy "own audits select" on public.offline_audits
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own audits insert" on public.offline_audits;
create policy "own audits insert" on public.offline_audits
  for insert with check (user_id = auth.uid());

drop policy if exists "own audits update" on public.offline_audits;
create policy "own audits update" on public.offline_audits
  for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own audits delete" on public.offline_audits;
create policy "own audits delete" on public.offline_audits
  for delete using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- OFFLINE PRODUCT EDITS (new queue table for employee product edits).
-- The controller (SyncService) matches this table's columns to the
-- existing website `products` table before upserting.
-- ---------------------------------------------------------------------
create table if not exists public.offline_product_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text,                       -- existing products.id when editing
  name text not null,
  price integer not null default 0,
  payload jsonb not null default '{}',   -- full record for upsert later
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists offline_product_edits_user_idx
  on public.offline_product_edits(user_id);

alter table public.offline_product_edits enable row level security;

drop policy if exists "own edits select" on public.offline_product_edits;
create policy "own edits select" on public.offline_product_edits
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own edits insert" on public.offline_product_edits;
create policy "own edits insert" on public.offline_product_edits
  for insert with check (user_id = auth.uid());

drop policy if exists "own edits update" on public.offline_product_edits;
create policy "own edits update" on public.offline_product_edits
  for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own edits delete" on public.offline_product_edits;
create policy "own edits delete" on public.offline_product_edits
  for delete using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- NOTE on `products` writes (employee product edits):
-- The live `products` table (created by the website) allows writes only
-- for admins via the "admin write products" policy. So a regular employee
-- account cannot upsert into `products` directly. Two options:
--   1. Make the editing user an admin (set profiles.role = 'admin').
--   2. Grant a narrower write policy here if you want employees to edit.
-- Decided to keep admin-only for safety; adjust the policy below only if
-- you explicitly want employees to write products directly.
-- ---------------------------------------------------------------------
