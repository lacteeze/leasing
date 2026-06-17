-- Run in Supabase SQL Editor after properties.sql

alter table public.properties
  add column if not exists management_status text not null default 'ACTIVE'
  check (management_status in ('ACTIVE', 'ARCHIVED'));

create index if not exists properties_management_status_idx
  on public.properties (management_status);
