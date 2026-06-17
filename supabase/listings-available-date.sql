-- Run in Supabase SQL Editor after schema.sql
-- Required for publish/relist (move-in available_date on listings)

alter table public.listings
  add column if not exists available_date date;
