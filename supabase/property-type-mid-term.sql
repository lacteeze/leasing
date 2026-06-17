-- Run in Supabase SQL Editor after schema.sql / properties.sql
-- Adds MID_TERM for flexible leases shorter than a standard 12-month term.

alter table public.properties
  drop constraint if exists properties_type_check;

alter table public.properties
  add constraint properties_type_check
  check (type in ('SINGLE', 'MULTI', 'MID_TERM', 'SHORT_TERM'));

alter table public.listings
  drop constraint if exists listings_type_check;

alter table public.listings
  add constraint listings_type_check
  check (type in ('SINGLE', 'MULTI', 'MID_TERM', 'SHORT_TERM'));
