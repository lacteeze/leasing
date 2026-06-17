-- Run in Supabase SQL Editor after properties-management-status.sql
-- Then run properties-occupancy-status-free-text.sql (required for custom statuses like Owner occupied)

alter table public.properties
  add column if not exists occupancy_status text
  check (occupancy_status is null or occupancy_status in ('short_term', 'standard'));
create index if not exists properties_occupancy_status_idx
  on public.properties (occupancy_status);
