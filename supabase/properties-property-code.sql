-- Run in Supabase SQL Editor after properties.sql
-- Human-readable Property ID for CSV imports (leases, listings, bulk uploads)

alter table public.properties
  add column if not exists property_code text;

create unique index if not exists properties_owner_property_code_idx
  on public.properties (created_by, property_code)
  where property_code is not null;

-- Backfill existing rows with stable codes from uuid
update public.properties
set property_code = 'P' || upper(substr(replace(id::text, '-', ''), 1, 8))
where property_code is null;
